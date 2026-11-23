//! Pure-Rust URL and domain content policy scanner without N-API bindings.

use unicode_normalization::UnicodeNormalization;
use unicode_skeleton::UnicodeSkeleton;

/// Returns `true` if `value` contains any URL or domain after NFKC
/// normalization, default-ignorable stripping, URL punctuation mapping, and
/// Unicode confusable skeleton folding.
pub fn contains_url_or_domain(value: &str) -> bool {
  let normalized = normalize_content(value);
  let skeleton = skeleton_content(&normalized);
  !scan_url_or_domain(&skeleton).is_empty()
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

fn scan_url_or_domain(value: &str) -> Vec<&str> {
  let mut matches = Vec::new();
  let chars = value.char_indices().collect::<Vec<_>>();
  let mut index = 0;
  while index < chars.len() {
    let start = chars[index].0;
    let remaining = &value[start..];
    if remaining.starts_with("http://") || remaining.starts_with("https://") || remaining.starts_with("www.") {
      let end = consume_non_space(value, start);
      matches.push(&value[start..end]);
      index = char_index_after(&chars, end);
      continue;
    }

    if is_domain_boundary_before(value, start) {
      let end = consume_domain(value, start);
      if end > start && is_domain_candidate(&value[start..end]) && is_domain_boundary_after(value, end) {
        matches.push(&value[start..end]);
        index = char_index_after(&chars, end);
        continue;
      }
    }
    index += 1;
  }
  matches
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

  #[test]
  fn scans_url_or_domain_cases() {
    for (input, expected) in [
      ("https://ｅxample．com", true),
      ("join 🅠⓿❶.example", true),
      ("exa\u{200b}mple.com", true),
      ("Team evil.com", true),
      ("Team \u{0435}vil。com", true),
      ("hello workspace", false),
      ("user@example.com", false),
    ] {
      assert_eq!(contains_url_or_domain(input), expected, "{input}");
    }
  }
}
