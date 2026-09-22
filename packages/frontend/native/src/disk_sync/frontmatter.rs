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
        // Preserve explicit empty titles (`title: ""`) so round-trip hashing can
        // distinguish them from a missing title field.
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
  value.trim().trim_matches('"').trim_matches('\'').to_string()
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

  let escaped = value.replace('"', "\\\"");
  format!("\"{}\"", escaped)
}
