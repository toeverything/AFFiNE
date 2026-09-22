use super::{
  super::block_spec::{BlockFlavour, BlockSpec},
  delta::{DeltaToMdOptions, delta_ops_to_markdown, delta_ops_to_plain_text},
};

pub(crate) struct MarkdownWriter<'a> {
  output: &'a mut String,
}

impl<'a> MarkdownWriter<'a> {
  pub(crate) fn new(output: &'a mut String) -> Self {
    Self { output }
  }

  pub(crate) fn push_paragraph(&mut self, prefix: &str, text: &str) {
    if prefix == "> " {
      let quoted = text
        .split('\n')
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n");
      self.output.push_str(&quoted);
      if !text.ends_with('\n') {
        self.output.push('\n');
      }
      self.output.push('\n');
      return;
    }

    self.output.push_str(prefix);
    self.output.push_str(text);
    if !text.ends_with('\n') {
      self.output.push('\n');
    }
    self.output.push('\n');
  }

  pub(crate) fn push_list_item(&mut self, indent: &str, prefix: &str, text: &str) {
    self.output.push_str(indent);
    self.output.push_str(prefix);
    self.output.push_str(text);
    if !text.ends_with('\n') {
      self.output.push('\n');
    }
  }

  pub(crate) fn push_code_block(&mut self, lang: &str, text: &str) {
    self.output.push_str("```");
    self.output.push_str(lang);
    self.output.push('\n');
    self.output.push_str(text);
    self.output.push_str("\n```\n\n");
  }

  pub(crate) fn push_divider(&mut self) {
    self.output.push_str("\n---\n\n");
  }

  pub(crate) fn push_table(&mut self, table: &str) {
    if table.is_empty() {
      self.output.push('\n');
      return;
    }
    self.output.push_str(table);
    if !table.ends_with('\n') {
      self.output.push('\n');
    }
    self.output.push('\n');
  }
}

pub(crate) fn paragraph_prefix(type_: &str) -> &'static str {
  match type_ {
    "h1" => "# ",
    "h2" => "## ",
    "h3" => "### ",
    "h4" => "#### ",
    "h5" => "##### ",
    "h6" => "###### ",
    "quote" => "> ",
    _ => "",
  }
}

pub(crate) fn list_prefix(r#type: &str, checked: bool, order: Option<i64>) -> String {
  match r#type {
    "bulleted" => "* ".to_string(),
    "todo" => if checked { "- [x] " } else { "- [ ] " }.to_string(),
    _ => format!("{}. ", order.unwrap_or(1)),
  }
}

pub(crate) fn list_indent(depth: usize) -> String {
  "    ".repeat(depth)
}

pub(crate) struct MarkdownRenderer<'a> {
  options: &'a DeltaToMdOptions,
}

impl<'a> MarkdownRenderer<'a> {
  pub(crate) fn new(options: &'a DeltaToMdOptions) -> Self {
    Self { options }
  }

  pub(crate) fn write_block(&self, output: &mut String, spec: &BlockSpec, list_depth: usize) {
    match spec.flavour {
      BlockFlavour::Paragraph => {
        let prefix = paragraph_prefix(spec.block_type_str().unwrap_or_default());
        let text_md = delta_ops_to_markdown(&spec.text, self.options);
        let mut writer = MarkdownWriter::new(output);
        writer.push_paragraph(prefix, &text_md);
      }
      BlockFlavour::List => {
        let type_ = spec.block_type_str().unwrap_or("bulleted");
        let checked = spec.checked.unwrap_or(false);
        let prefix = list_prefix(type_, checked, spec.order);
        let indent = list_indent(list_depth);
        let text_md = delta_ops_to_markdown(&spec.text, self.options);
        let mut writer = MarkdownWriter::new(output);
        writer.push_list_item(&indent, &prefix, &text_md);
      }
      BlockFlavour::Code => {
        let text = delta_ops_to_plain_text(&spec.text);
        let lang = spec.language.as_deref().unwrap_or_default();
        let mut writer = MarkdownWriter::new(output);
        writer.push_code_block(lang, &text);
      }
      BlockFlavour::Divider => {
        let mut writer = MarkdownWriter::new(output);
        writer.push_divider();
      }
      BlockFlavour::Image => {
        if let Some(image) = spec.image.as_ref() {
          output.push_str(&image.render_markdown());
        }
      }
      BlockFlavour::Bookmark => {
        if let Some(bookmark) = spec.bookmark.as_ref() {
          output.push_str(&format!("\n[](Bookmark,{})\n\n", bookmark.url));
        }
      }
      BlockFlavour::EmbedYoutube => {
        if let Some(embed) = spec.embed_youtube.as_ref() {
          output.push_str(
            &format!(
              "\n        <iframe\n          type=\"text/html\"\n          width=\"100%\"\n          height=\"410px\"\n          src=\"https://www.youtube.com/embed/{}\"\n          frameborder=\"0\"\n          allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\"\n          allowfullscreen\n          credentialless>\n        </iframe>\n\n",
              embed.video_id
            )
          );
        }
      }
      BlockFlavour::EmbedIframe => {
        if let Some(embed) = spec.embed_iframe.as_ref() {
          output.push_str(&format!("\n<iframe src=\"{}\"></iframe>\n\n", embed.url));
        }
      }
      BlockFlavour::Callout => {}
      BlockFlavour::Table => {
        if let Some(table) = spec.table.as_ref()
          && let Some(table_md) = table.render_markdown()
        {
          let mut writer = MarkdownWriter::new(output);
          writer.push_table(&table_md);
        }
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_paragraph_newlines() {
    let mut markdown = String::new();
    {
      let mut writer = MarkdownWriter::new(&mut markdown);
      writer.push_paragraph("# ", "Title\n");
    }
    assert_eq!(markdown, "# Title\n\n");

    markdown.clear();
    {
      let mut writer = MarkdownWriter::new(&mut markdown);
      writer.push_paragraph("", "Plain");
    }
    assert_eq!(markdown, "Plain\n\n");
  }

  #[test]
  fn test_list_newlines() {
    let mut markdown = String::new();
    {
      let mut writer = MarkdownWriter::new(&mut markdown);
      writer.push_list_item("    ", "* ", "Item\n");
    }
    assert_eq!(markdown, "    * Item\n");

    markdown.clear();
    {
      let mut writer = MarkdownWriter::new(&mut markdown);
      writer.push_list_item("", "- [ ] ", "Task");
    }
    assert_eq!(markdown, "- [ ] Task\n");
  }

  #[test]
  fn test_code_block_newlines() {
    let mut markdown = String::new();
    {
      let mut writer = MarkdownWriter::new(&mut markdown);
      writer.push_code_block("rs", "fn main() {}");
    }
    assert_eq!(markdown, "```rs\nfn main() {}\n```\n\n");
  }

  #[test]
  fn test_table_newlines() {
    let mut markdown = String::new();
    {
      let mut writer = MarkdownWriter::new(&mut markdown);
      writer.push_table("|a|b|\n|---|---|\n|1|2|\n");
    }
    assert_eq!(markdown, "|a|b|\n|---|---|\n|1|2|\n\n");

    markdown.clear();
    {
      let mut writer = MarkdownWriter::new(&mut markdown);
      writer.push_table("|a|b|");
    }
    assert_eq!(markdown, "|a|b|\n\n");
  }
}
