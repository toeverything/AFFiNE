use super::types::FrontmatterMeta;

pub(crate) fn parse_frontmatter(markdown: &str) -> (FrontmatterMeta, String) {
  let normalized = markdown.replace("\r\n", "\n");
  if !normalized.starts_with("---\n") {
    return (FrontmatterMeta::default(), normalized);
  }

  let rest = &normalized[4..];
  let Some(end) = rest.find("\n---\n") else {
    return (FrontmatterMeta::default(), normalized);
  };

  let frontmatter_block = &rest[..end];
  let body = rest[(end + 5)..].to_string();

  let mut meta = FrontmatterMeta::default();
  let mut in_tags_block = false;

  for raw_line in frontmatter_block.lines() {
    let line = raw_line.trim();
    if line.is_empty() {
      continue;
    }

    if in_tags_block && line.starts_with('-') {
      let value = normalize_scalar(line.trim_start_matches('-').trim());
      if !value.is_empty() {
        meta.tags.get_or_insert_with(Vec::new).push(value);
      }
      continue;
    }

    in_tags_block = false;

    let Some((key, value)) = line.split_once(':') else {
      continue;
    };

    let key = key.trim();
    let value = value.trim();

    match key {
      "id" => {
        let normalized = normalize_scalar(value);
        if !normalized.is_empty() {
          meta.id = Some(normalized);
        }
      }
      "title" => {
        let normalized = normalize_scalar(value);
        // Preserve explicit empty titles (`title: ""`) so round-trip hashing
        // can distinguish them from a missing title field.
        meta.title = Some(normalized);
      }
      "favorite" => {
        meta.favorite = parse_bool(value);
      }
      "trash" => {
        meta.trash = parse_bool(value);
      }
      "tags" => {
        if value.is_empty() {
          in_tags_block = true;
        } else {
          let tags = parse_tags(value);
          if !tags.is_empty() {
            meta.tags = Some(tags);
          }
        }
      }
      _ => {}
    }
  }

  (meta, body)
}

pub(crate) fn render_frontmatter(meta: &FrontmatterMeta, body: &str) -> String {
  let mut lines = Vec::new();
  lines.push("---".to_string());

  if let Some(id) = meta.id.as_ref() {
    lines.push(format!("id: {}", quote_yaml_scalar(id)));
  }

  if let Some(title) = meta.title.as_ref() {
    lines.push(format!("title: {}", quote_yaml_scalar(title)));
  }

  if let Some(tags) = normalize_tags(meta.tags.clone()) {
    if tags.is_empty() {
      lines.push("tags: []".to_string());
    } else {
      lines.push("tags:".to_string());
      for tag in tags {
        lines.push(format!("  - {}", quote_yaml_scalar(&tag)));
      }
    }
  }

  if let Some(favorite) = meta.favorite {
    lines.push(format!("favorite: {}", favorite));
  }

  if let Some(trash) = meta.trash {
    lines.push(format!("trash: {}", trash));
  }

  lines.push("---".to_string());
  lines.push(String::new());

  let mut rendered = lines.join("\n");
  rendered.push_str(body.trim_start_matches('\n'));

  if !rendered.ends_with('\n') {
    rendered.push('\n');
  }

  rendered
}

fn normalize_scalar(value: &str) -> String {
  let value = value.trim();

  if let Some(inner) = value.strip_prefix('"').and_then(|value| value.strip_suffix('"')) {
    return unescape_double_quoted_scalar(inner);
  }

  if let Some(inner) = value.strip_prefix('\'').and_then(|value| value.strip_suffix('\'')) {
    return inner.replace("''", "'");
  }

  value.to_string()
}

fn unescape_double_quoted_scalar(value: &str) -> String {
  let mut unescaped = String::with_capacity(value.len());
  let mut chars = value.chars();

  while let Some(ch) = chars.next() {
    if ch != '\\' {
      unescaped.push(ch);
      continue;
    }

    match chars.next() {
      Some('0') => unescaped.push('\0'),
      Some('a') => unescaped.push('\x07'),
      Some('b') => unescaped.push('\x08'),
      Some('t') => unescaped.push('\t'),
      Some('n') => unescaped.push('\n'),
      Some('v') => unescaped.push('\x0b'),
      Some('f') => unescaped.push('\x0c'),
      Some('r') => unescaped.push('\r'),
      Some('e') => unescaped.push('\x1b'),
      Some('"') => unescaped.push('"'),
      Some('\\') => unescaped.push('\\'),
      Some('x') => push_hex_escape(&mut chars, 2, 'x', &mut unescaped),
      Some('u') => push_hex_escape(&mut chars, 4, 'u', &mut unescaped),
      Some('U') => push_hex_escape(&mut chars, 8, 'U', &mut unescaped),
      Some(other) => {
        unescaped.push('\\');
        unescaped.push(other);
      }
      None => unescaped.push('\\'),
    }
  }

  unescaped
}

fn push_hex_escape(chars: &mut impl Iterator<Item = char>, width: usize, marker: char, output: &mut String) {
  let digits: String = chars.take(width).collect();
  let decoded = (digits.len() == width)
    .then(|| u32::from_str_radix(&digits, 16).ok())
    .flatten()
    .and_then(char::from_u32);

  if let Some(decoded) = decoded {
    output.push(decoded);
  } else {
    output.push('\\');
    output.push(marker);
    output.push_str(&digits);
  }
}

pub(crate) fn parse_bool(value: &str) -> Option<bool> {
  match value.trim().to_ascii_lowercase().as_str() {
    "true" | "yes" | "1" => Some(true),
    "false" | "no" | "0" => Some(false),
    _ => None,
  }
}

pub(crate) fn parse_tags(value: &str) -> Vec<String> {
  let trimmed = value.trim();

  if trimmed.starts_with('[') && trimmed.ends_with(']') {
    let inner = &trimmed[1..trimmed.len() - 1];
    return inner
      .split(',')
      .map(normalize_scalar)
      .filter(|value| !value.is_empty())
      .collect();
  }

  trimmed
    .split(',')
    .map(normalize_scalar)
    .filter(|value| !value.is_empty())
    .collect()
}

pub(crate) fn normalize_tags(tags: Option<Vec<String>>) -> Option<Vec<String>> {
  tags.map(|values| {
    values
      .into_iter()
      .map(|value| value.trim().to_string())
      .filter(|value| !value.is_empty())
      .collect()
  })
}

fn quote_yaml_scalar(value: &str) -> String {
  if value
    .chars()
    .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
  {
    return value.to_string();
  }

  let mut escaped = String::with_capacity(value.len());
  for ch in value.chars() {
    match ch {
      '\0' => escaped.push_str("\\0"),
      '\x07' => escaped.push_str("\\a"),
      '\x08' => escaped.push_str("\\b"),
      '\t' => escaped.push_str("\\t"),
      '\n' => escaped.push_str("\\n"),
      '\x0b' => escaped.push_str("\\v"),
      '\x0c' => escaped.push_str("\\f"),
      '\r' => escaped.push_str("\\r"),
      '\x1b' => escaped.push_str("\\e"),
      '"' => escaped.push_str("\\\""),
      '\\' => escaped.push_str("\\\\"),
      other if other.is_control() && (other as u32) <= 0xffff => {
        escaped.push_str(&format!("\\u{:04X}", other as u32));
      }
      other if other.is_control() => {
        escaped.push_str(&format!("\\U{:08X}", other as u32));
      }
      other => escaped.push(other),
    }
  }
  format!("\"{}\"", escaped)
}
