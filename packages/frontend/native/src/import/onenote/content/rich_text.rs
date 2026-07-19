use onenote_parser::{
  contents::{ParagraphStyling, RichText},
  property::common::ColorRef,
};

pub(super) fn rich_text_markdown(text: &RichText) -> String {
  let mut markdown = styled_text_markdown(text);
  let trimmed = markdown.trim();
  if trimmed.is_empty() {
    return String::new();
  }

  if let Some(prefix) = heading_prefix(text, trimmed) {
    markdown = format!("{prefix} {}", trimmed.trim_start_matches('#').trim_start());
  }
  markdown
}

fn styled_text_markdown(text: &RichText) -> String {
  let chars = text.text().chars().collect::<Vec<_>>();
  let styles = text.text_run_formatting();
  if chars.is_empty() {
    return String::new();
  }
  if styles.is_empty() {
    return chars.into_iter().collect();
  }

  let mut output = String::new();
  let mut start = 0usize;
  let mut pending_link: Option<String> = None;
  for (index, style) in styles.iter().enumerate() {
    let end = text
      .text_run_indices()
      .get(index)
      .map(|end| (*end as usize).min(chars.len()))
      .unwrap_or(chars.len());
    if end < start {
      continue;
    }
    let segment = chars[start..end].iter().collect::<String>();
    start = end;
    if segment.is_empty() {
      continue;
    }
    if style.hidden() {
      if let Some(url) = extract_hyperlink_url(&segment) {
        pending_link = Some(url);
      }
      continue;
    }
    output.push_str(&format_segment(&segment, style, &mut pending_link));
  }
  if start < chars.len() {
    output.push_str(&chars[start..].iter().collect::<String>());
  }
  output
}

fn heading_prefix(text: &RichText, value: &str) -> Option<&'static str> {
  if value.chars().count() > 120 || value.lines().count() > 1 {
    return None;
  }
  let font_size = text
    .text_run_formatting()
    .iter()
    .filter(|style| !style.hidden())
    .filter_map(ParagraphStyling::font_size)
    .max()
    .or_else(|| text.paragraph_style().font_size());

  match font_size {
    Some(size) if size >= 28 => Some("##"),
    Some(size) if size >= 24 => Some("###"),
    _ => None,
  }
}

fn format_segment(segment: &str, style: &ParagraphStyling, pending_link: &mut Option<String>) -> String {
  let mut value = escape_html(segment);
  if segment.trim().is_empty() {
    return value;
  }

  if style.bold() && should_keep_inline_style(segment) {
    value = wrap_inline(&value, "<strong>", "</strong>");
  }
  if style.italic() && should_keep_inline_style(segment) {
    value = wrap_inline(&value, "<em>", "</em>");
  }
  if style.strikethrough() {
    value = wrap_inline(&value, "<del>", "</del>");
  }
  if style.underline() {
    value = wrap_inline(&value, "<u>", "</u>");
  }
  if let Some(color) = style.font_color().and_then(hex_color) {
    value = wrap_inline(&value, &format!("<span style=\"color: {color}\">"), "</span>");
  }
  if let Some(color) = style.highlight().and_then(hex_color) {
    value = wrap_inline(&value, &format!("<span style=\"color: {color}\">"), "</span>");
  }

  if style.hyperlink_protected()
    && let Some(url) = pending_link.take()
  {
    return wrap_inline(&value, &format!("<a href=\"{}\">", escape_html_attr(&url)), "</a>");
  }
  value
}

fn should_keep_inline_style(value: &str) -> bool {
  value.chars().any(|ch| ch.is_alphanumeric())
}

fn wrap_inline(value: &str, open: &str, close: &str) -> String {
  let leading_len = value.len() - value.trim_start().len();
  let trailing_len = value.len() - value.trim_end().len();
  let (leading, rest) = value.split_at(leading_len);
  let (middle, trailing) = rest.split_at(rest.len().saturating_sub(trailing_len));
  if middle.is_empty() {
    value.to_string()
  } else {
    format!("{leading}{open}{middle}{close}{trailing}")
  }
}

fn hex_color(color: ColorRef) -> Option<String> {
  match color {
    ColorRef::Auto => None,
    ColorRef::Manual { r, g, b } => Some(format!("#{r:02x}{g:02x}{b:02x}")),
  }
}

fn escape_html(value: &str) -> String {
  let mut output = String::with_capacity(value.len());
  for ch in value.chars() {
    match ch {
      '&' => output.push_str("&amp;"),
      '<' => output.push_str("&lt;"),
      '>' => output.push_str("&gt;"),
      _ => output.push(ch),
    }
  }
  output
}

fn escape_html_attr(value: &str) -> String {
  let mut output = String::with_capacity(value.len());
  for ch in value.chars() {
    match ch {
      '&' => output.push_str("&amp;"),
      '<' => output.push_str("&lt;"),
      '>' => output.push_str("&gt;"),
      '"' => output.push_str("&quot;"),
      _ => output.push(ch),
    }
  }
  output
}

fn extract_hyperlink_url(value: &str) -> Option<String> {
  let marker = "HYPERLINK";
  let start = value.find(marker)? + marker.len();
  let rest = value[start..].trim();
  if let Some(quoted) = rest.strip_prefix('"') {
    let end = quoted.find('"')?;
    return Some(quoted[..end].to_string());
  }
  rest.split_whitespace().next().map(ToString::to_string)
}
