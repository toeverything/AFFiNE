use napi_derive::napi;
use unicode_normalization::UnicodeNormalization;
use unicode_skeleton::UnicodeSkeleton;

const VERSION: u32 = 1;

#[napi(object)]
pub struct ContentPolicyScanInput {
  pub value: String,
  pub checks: Option<Vec<String>>,
}

#[napi(object)]
pub struct ContentPolicyMatchSpan {
  pub start: u32,
  pub end: u32,
}

#[napi(object)]
pub struct ContentPolicyMatch {
  #[napi(js_name = "type")]
  pub match_type: String,
  pub reason: String,
  pub value: Option<String>,
  pub span: Option<ContentPolicyMatchSpan>,
}

#[napi(object)]
pub struct ContentPolicyScanResult {
  pub version: u32,
  pub original: String,
  pub normalized: String,
  pub skeleton: String,
  pub matched: bool,
  pub matches: Vec<ContentPolicyMatch>,
  pub flags: Vec<String>,
}

#[napi]
pub fn scan_content_policy_v1(input: ContentPolicyScanInput) -> ContentPolicyScanResult {
  let original = input.value;
  let normalized = normalize_content(&original);
  let skeleton = skeleton_content(&normalized);
  let mut flags = Vec::new();
  if normalized != original {
    flags.push("unicode_normalized".to_string());
  }
  if skeleton != normalized {
    flags.push("confusable_skeleton_changed".to_string());
  }

  let mut matches = Vec::new();
  if should_run_check(input.checks.as_deref(), "url_or_domain") {
    matches.extend(scan_url_or_domain(&skeleton));
  }

  ContentPolicyScanResult {
    version: VERSION,
    original,
    normalized,
    skeleton,
    matched: !matches.is_empty(),
    matches,
    flags,
  }
}

fn should_run_check(checks: Option<&[String]>, check: &str) -> bool {
  checks
    .map(|checks| checks.iter().any(|configured| configured == check))
    .unwrap_or(true)
}

fn normalize_content(value: &str) -> String {
  value.nfkc().collect::<String>()
}

fn skeleton_content(value: &str) -> String {
  let mut output = String::with_capacity(value.len());
  for ch in value.chars() {
    push_skeleton_char(&mut output, ch);
  }
  output
}

fn push_skeleton_char(output: &mut String, ch: char) {
  if is_default_ignorable(ch) {
    return;
  }
  if let Some(replacement) = url_punctuation_ascii(ch).or_else(|| enclosed_ascii(ch)) {
    output.push_str(replacement);
    return;
  }
  if ch.is_ascii() {
    output.extend(ch.to_lowercase());
    return;
  }

  let source = ch.to_string();
  let skeleton = source.skeleton_chars().collect::<String>();
  if skeleton == source {
    output.extend(ch.to_lowercase());
    return;
  }

  for skeleton_ch in skeleton.chars() {
    push_skeleton_char(output, skeleton_ch);
  }
}

fn is_default_ignorable(ch: char) -> bool {
  matches!(
    ch,
    '\u{00ad}'
      | '\u{034f}'
      | '\u{061c}'
      | '\u{180e}'
      | '\u{200b}'..='\u{200f}'
      | '\u{202a}'..='\u{202e}'
      | '\u{2060}'..='\u{206f}'
      | '\u{fe00}'..='\u{fe0f}'
      | '\u{feff}'
      | '\u{e0100}'..='\u{e01ef}'
  )
}

fn enclosed_ascii(ch: char) -> Option<&'static str> {
  let code = ch as u32;
  if (0x1f150..=0x1f169).contains(&code) {
    return ASCII_LOWERCASE.get((code - 0x1f150) as usize).copied();
  }
  if ch == '⓿' || ch == '🄌' {
    return Some("0");
  }
  for (start, digits) in [
    (0x2776, ASCII_DIGITS_1_TO_9),
    (0x2780, ASCII_DIGITS_1_TO_9),
    (0x278a, ASCII_DIGITS_1_TO_9),
  ] {
    if (start..=start + 8).contains(&code) {
      return digits.get((code - start) as usize).copied();
    }
  }
  None
}

const ASCII_LOWERCASE: [&str; 26] = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w",
  "x", "y", "z",
];

const ASCII_DIGITS_1_TO_9: [&str; 9] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

fn url_punctuation_ascii(ch: char) -> Option<&'static str> {
  match ch {
    // URL punctuation variants that are not always useful in generic skeletons.
    '。' | '．' | '｡' | '․' | '‧' | '∙' | '●' | '•' => Some("."),
    '⁄' | '∕' | '╱' | '／' => Some("/"),
    '：' | '꞉' | 'ː' | '։' => Some(":"),
    '‐' | '‑' | '‒' | '–' | '—' | '―' | '−' | '﹘' | '－' => Some("-"),
    '_' | '＿' => Some("_"),
    _ => None,
  }
}

fn scan_url_or_domain(value: &str) -> Vec<ContentPolicyMatch> {
  let mut matches = Vec::new();
  let chars = value.char_indices().collect::<Vec<_>>();
  let mut index = 0;
  while index < chars.len() {
    let start = chars[index].0;
    let remaining = &value[start..];
    if remaining.starts_with("http://") || remaining.starts_with("https://") || remaining.starts_with("www.") {
      let end = consume_non_space(value, start);
      matches.push(match_result(value, start, end));
      index = char_index_after(&chars, end);
      continue;
    }

    if is_domain_boundary_before(value, start) {
      let end = consume_domain(value, start);
      if end > start && is_domain_candidate(&value[start..end]) && is_domain_boundary_after(value, end) {
        matches.push(match_result(value, start, end));
        index = char_index_after(&chars, end);
        continue;
      }
    }
    index += 1;
  }
  matches
}

fn match_result(value: &str, start: usize, end: usize) -> ContentPolicyMatch {
  ContentPolicyMatch {
    match_type: "url_or_domain".to_string(),
    reason: "contains_url_or_domain".to_string(),
    value: Some(value[start..end].to_string()),
    span: Some(ContentPolicyMatchSpan {
      start: start as u32,
      end: end as u32,
    }),
  }
}

fn consume_non_space(value: &str, start: usize) -> usize {
  value[start..]
    .char_indices()
    .find_map(|(offset, ch)| ch.is_whitespace().then_some(start + offset))
    .unwrap_or(value.len())
}

fn consume_domain(value: &str, start: usize) -> usize {
  value[start..]
    .char_indices()
    .find_map(|(offset, ch)| (!is_domain_char(ch)).then_some(start + offset))
    .unwrap_or(value.len())
}

fn is_domain_candidate(candidate: &str) -> bool {
  let labels = candidate.split('.').collect::<Vec<_>>();
  if labels.len() < 2 {
    return false;
  }
  let Some(tld) = labels.last() else {
    return false;
  };
  if !(2..=63).contains(&tld.len()) || !tld.chars().all(|ch| ch.is_ascii_alphabetic()) {
    return false;
  }
  labels.iter().all(|label| {
    !label.is_empty()
      && label.len() <= 63
      && !label.starts_with('-')
      && !label.ends_with('-')
      && label.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
  })
}

fn is_domain_char(ch: char) -> bool {
  ch.is_ascii_alphanumeric() || ch == '-' || ch == '.'
}

fn is_domain_boundary_before(value: &str, start: usize) -> bool {
  if start == 0 {
    return true;
  }
  let Some(previous) = value[..start].chars().next_back() else {
    return true;
  };
  !(previous.is_ascii_alphanumeric() || previous == '-' || previous == '_' || previous == '@')
}

fn is_domain_boundary_after(value: &str, end: usize) -> bool {
  if end >= value.len() {
    return true;
  }
  let Some(next) = value[end..].chars().next() else {
    return true;
  };
  !(next.is_ascii_alphanumeric() || next == '-' || next == '_' || next == '.')
}

fn char_index_after(chars: &[(usize, char)], byte_index: usize) -> usize {
  chars
    .iter()
    .position(|(offset, _)| *offset >= byte_index)
    .unwrap_or(chars.len())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn scan(value: &str) -> ContentPolicyScanResult {
    scan_content_policy_v1(ContentPolicyScanInput {
      value: value.to_string(),
      checks: None,
    })
  }

  #[test]
  fn scans_url_or_domain_cases() {
    struct Case {
      input: &'static str,
      matched: bool,
      skeleton: &'static str,
      value: Option<&'static str>,
    }

    for case in [
      Case {
        input: "https://ｅxample．com",
        matched: true,
        skeleton: "https://example.com",
        value: Some("https://example.com"),
      },
      Case {
        input: "join 🅠⓿❶.example",
        matched: true,
        skeleton: "join q01.example",
        value: Some("q01.example"),
      },
      Case {
        input: "exa\u{200b}mple.com",
        matched: true,
        skeleton: "example.com",
        value: Some("example.com"),
      },
      Case {
        input: "hello workspace",
        matched: false,
        skeleton: "hello workspace",
        value: None,
      },
      Case {
        input: "user@example.com",
        matched: false,
        skeleton: "user@example.com",
        value: None,
      },
    ] {
      let result = scan(case.input);
      assert_eq!(result.matched, case.matched, "{}", case.input);
      assert_eq!(result.skeleton, case.skeleton, "{}", case.input);
      assert_eq!(
        result.matches.first().and_then(|matched| matched.value.as_deref()),
        case.value,
        "{}",
        case.input
      );
    }
  }
}
