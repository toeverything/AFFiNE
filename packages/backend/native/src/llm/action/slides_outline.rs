use serde_json::{Map, Value};

pub(super) fn project_slides_outline_markdown(value: &Value) -> Result<String, String> {
  let text = match value {
    Value::String(text) => text.as_str(),
    Value::Object(object) => {
      if let Some(Value::String(text)) = object.get("result") {
        text
      } else if let Some(Value::String(text)) = object.get("content") {
        text
      } else if let Some(Value::String(text)) = object.get("text") {
        text
      } else {
        return Err("slidesOutlineMarkdown requires a string result".to_string());
      }
    }
    _ => return Err("slidesOutlineMarkdown requires a string result".to_string()),
  };

  if is_markdown_list(text) {
    return Ok(text.to_string());
  }

  let mut projected = Vec::new();
  for line in text.lines().filter(|line| !line.trim().is_empty()) {
    let item = serde_json::from_str::<Value>(line)
      .map_err(|_| "slidesOutlineMarkdown requires markdown or NDJSON object lines".to_string())?;
    if !item.is_object() {
      return Err("slidesOutlineMarkdown requires markdown or NDJSON object lines".to_string());
    }
    projected.push(render_slide_item(&item)?);
  }

  if projected.is_empty() {
    Err("slidesOutlineMarkdown requires markdown or NDJSON object lines".to_string())
  } else {
    Ok(projected.join("\n"))
  }
}

fn is_markdown_list(text: &str) -> bool {
  let mut saw_line = false;
  for line in text.lines().map(str::trim_start).filter(|line| !line.trim().is_empty()) {
    saw_line = true;
    if !(line.starts_with("- ") || line.starts_with("* ") || line.starts_with("+ ")) {
      return false;
    }
  }
  saw_line
}

fn render_legacy_slide_item(item: &Value) -> Option<String> {
  let kind = item.get("type").and_then(Value::as_str)?;
  let content = item.get("content").and_then(value_to_optional_string)?;
  if content.is_empty() {
    return None;
  }

  match kind {
    "name" => Some(format!("- {content}")),
    "title" => Some(format!("  - {content}")),
    "content" => {
      if content.contains('\n') {
        Some(
          content
            .lines()
            .map(|line| format!("    - {line}"))
            .collect::<Vec<_>>()
            .join("\n"),
        )
      } else {
        Some(format!("    - {content}"))
      }
    }
    _ => None,
  }
}

fn render_slide_item(item: &Value) -> Result<String, String> {
  if let Some(markdown) = render_legacy_slide_item(item) {
    return Ok(markdown);
  }
  if item.get("content").and_then(Value::as_object).is_some() {
    return render_structured_slide_item(item);
  }
  if item.get("content").and_then(Value::as_str).is_some() {
    return render_labeled_string_slide_item(item);
  }
  Err("slidesOutlineMarkdown item is not a recognized slide outline object".to_string())
}

fn render_labeled_string_slide_item(item: &Value) -> Result<String, String> {
  let content = item
    .get("content")
    .and_then(Value::as_str)
    .ok_or_else(|| "slidesOutlineMarkdown labeled item requires string content".to_string())?;
  if content.trim().is_empty() {
    return Err("slidesOutlineMarkdown labeled item requires string content".to_string());
  }
  let labels = parse_labeled_segments(content);
  let title = labels
    .get("title")
    .cloned()
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "slidesOutlineMarkdown labeled item requires Title".to_string())?;
  let keywords = labels
    .get("image keywords")
    .cloned()
    .or_else(|| labels.get("keywords").cloned())
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "slidesOutlineMarkdown labeled item requires Image Keywords".to_string())?;
  let description = labels
    .get("description")
    .cloned()
    .or_else(|| labels.get("content").cloned())
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "slidesOutlineMarkdown labeled item requires Description".to_string())?;

  Ok(
    [
      format!("- {title}"),
      format!("  - {title}"),
      format!("    - {keywords}"),
      format!("    - {description}"),
    ]
    .join("\n"),
  )
}

fn render_structured_slide_item(item: &Value) -> Result<String, String> {
  let item_object = item
    .as_object()
    .ok_or_else(|| "slidesOutlineMarkdown structured item requires object content".to_string())?;
  let content = item
    .get("content")
    .and_then(Value::as_object)
    .ok_or_else(|| "slidesOutlineMarkdown structured item requires object content".to_string())?;
  let title = string_prop(content, &["title", "name", "page_name", "pageName"])
    .or_else(|| string_prop(item_object, &["title", "name", "page_name", "pageName", "page"]))
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "slidesOutlineMarkdown requires slide title".to_string())?;
  let sections = content.get("sections").and_then(Value::as_array);
  let rendered_sections = if let Some(sections) = sections.filter(|sections| !sections.is_empty()) {
    sections
      .iter()
      .enumerate()
      .map(|(index, section)| render_slide_section(section, index + 1))
      .collect::<Result<Vec<_>, _>>()?
      .into_iter()
      .flatten()
      .collect::<Vec<_>>()
  } else {
    render_slide_object(content)?
  };

  Ok(
    std::iter::once(format!("- {title}"))
      .chain(rendered_sections)
      .collect::<Vec<_>>()
      .join("\n"),
  )
}

fn parse_labeled_segments(text: &str) -> std::collections::HashMap<String, String> {
  text
    .split(';')
    .filter_map(|segment| {
      let (key, value) = segment.split_once(':')?;
      let key = key.trim().to_ascii_lowercase();
      let value = value.trim().to_string();
      if key.is_empty() || value.is_empty() {
        None
      } else {
        Some((key, value))
      }
    })
    .collect()
}

fn render_slide_section(section: &Value, index: usize) -> Result<Vec<String>, String> {
  let Some(object) = section.as_object() else {
    return Err(format!("slidesOutlineMarkdown section {index} requires object content"));
  };

  render_slide_object(object)
}

fn render_slide_object(object: &Map<String, Value>) -> Result<Vec<String>, String> {
  let title = required_string_prop(
    object,
    &["title", "name", "section", "page_name", "pageName"],
    "slide section title",
  )?;
  let keywords = string_prop(
    object,
    &["image_keywords", "imageKeywords", "keywords", "image_keywords_optional"],
  )
  .filter(|value| !value.is_empty())
  .unwrap_or_else(|| title.clone());
  let content = required_string_prop(
    object,
    &["content", "description", "summary", "text"],
    "slide section content",
  )?;

  Ok(vec![
    format!("  - {title}"),
    format!("    - {keywords}"),
    format!("    - {content}"),
  ])
}

fn string_prop(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
  keys
    .iter()
    .find_map(|key| object.get(*key).and_then(value_to_optional_string))
}

fn required_string_prop(object: &Map<String, Value>, keys: &[&str], name: &str) -> Result<String, String> {
  string_prop(object, keys)
    .filter(|value| !value.is_empty())
    .ok_or_else(|| format!("slidesOutlineMarkdown requires {name}"))
}

fn value_to_optional_string(value: &Value) -> Option<String> {
  match value {
    Value::String(text) => Some(text.clone()),
    Value::Number(number) => Some(number.to_string()),
    Value::Array(items) => {
      let joined = items
        .iter()
        .filter_map(value_to_optional_string)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(", ");
      Some(joined)
    }
    _ => None,
  }
}
