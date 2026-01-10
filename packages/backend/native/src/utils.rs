fn collapse_whitespace(s: &str) -> String {
  let mut result = String::new();
  let mut prev_was_whitespace = false;
  for c in s.chars() {
    if c.is_whitespace() {
      if !prev_was_whitespace {
        result.push(' ');
        prev_was_whitespace = true;
      }
    } else {
      result.push(c);
      prev_was_whitespace = false;
    }
  }
  result
}

fn try_remove_label(s: &str, i: usize) -> Option<usize> {
  let mut next_idx = match s[i..].to_ascii_lowercase() {
    s if s.starts_with("figure") => i + 6,
    s if s.starts_with("table") => i + 5,
    _ => return None,
  };

  if next_idx >= s.len() {
    return None;
  }

  if let Some(ch) = s[next_idx..].chars().next() {
    if !ch.is_whitespace() {
      return None;
    }
  } else {
    return None;
  }

  while next_idx < s.len() {
    let ch = s[next_idx..].chars().next()?;
    if ch.is_whitespace() {
      next_idx += ch.len_utf8();
    } else {
      break;
    }
  }

  let start_digits = next_idx;
  while next_idx < s.len() {
    let ch = s[next_idx..].chars().next()?;
    if ch.is_ascii_digit() {
      next_idx += ch.len_utf8();
    } else {
      break;
    }
  }

  if next_idx == start_digits {
    return None;
  }

  if let Some(ch) = s[next_idx..].chars().next()
    && ch == '.'
  {
    next_idx += ch.len_utf8();
    return Some(next_idx);
  }
  None
}

fn remove_label(s: &str) -> String {
  let mut result = String::with_capacity(s.len());
  let mut i = 0;
  while i < s.len() {
    if let Some(next_idx) = try_remove_label(s, i) {
      i = next_idx;
      continue;
    }

    let ch = s[i..].chars().next().unwrap();
    result.push(ch);
    i += ch.len_utf8();
  }
  result
}

pub fn clean_content(content: &str) -> String {
  let content = content.replace("\x00", "");
  remove_label(&collapse_whitespace(&content)).trim().to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_clean_input() {
    let inputs = [
      "FIGURE 1. This is a\t test\n\nwith multiple lines",
      "table 2. Another test\x00 with null",
      "Some text \t\n without       label",
    ];
    let cleaned = [
      "This is a test with multiple lines",
      "Another test with null",
      "Some text without label",
    ];

    assert_eq!(cleaned, inputs.map(clean_content));
  }
}
