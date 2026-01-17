#[derive(Clone, Copy)]
pub(super) struct MarkdownTableOptions {
  pub(super) escape_pipes: bool,
  pub(super) newline_replacement: &'static str,
  pub(super) trim: bool,
}

impl MarkdownTableOptions {
  pub(super) const fn new(escape_pipes: bool, newline_replacement: &'static str, trim: bool) -> Self {
    Self {
      escape_pipes,
      newline_replacement,
      trim,
    }
  }
}

pub(super) fn render_markdown_table(rows: &[Vec<String>], options: MarkdownTableOptions) -> Option<String> {
  let (header, body) = rows.split_first()?;
  let header_line = format_table_row(header, options);
  let separator_line = format_table_row(&vec!["---".to_string(); header.len()], options);
  let mut lines = vec![header_line, separator_line];
  for row in body {
    lines.push(format_table_row(row, options));
  }
  Some(lines.join("\n"))
}

fn format_table_row(row: &[String], options: MarkdownTableOptions) -> String {
  let cells = row
    .iter()
    .map(|cell| format_table_cell(cell, options))
    .collect::<Vec<_>>();
  format!("|{}|", cells.join("|"))
}

fn format_table_cell(cell: &str, options: MarkdownTableOptions) -> String {
  let mut value = if options.trim {
    cell.trim().to_string()
  } else {
    cell.to_string()
  };

  if options.escape_pipes {
    value = value.replace('|', "\\|");
  }
  if !options.newline_replacement.is_empty() {
    value = collapse_newlines(&value, options.newline_replacement);
  }
  value
}

fn collapse_newlines(value: &str, replacement: &str) -> String {
  if replacement.is_empty() {
    return value.to_string();
  }
  let mut out = String::with_capacity(value.len());
  let mut in_newline = false;
  for ch in value.chars() {
    if ch == '\n' {
      if !in_newline {
        out.push_str(replacement);
        in_newline = true;
      }
    } else {
      in_newline = false;
      out.push(ch);
    }
  }
  out
}
