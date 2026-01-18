const INLINE_ATTR_BOLD: &str = "bold";
const INLINE_ATTR_ITALIC: &str = "italic";
const INLINE_ATTR_UNDERLINE: &str = "underline";
const INLINE_ATTR_STRIKE: &str = "strike";
const INLINE_ATTR_CODE: &str = "code";
const INLINE_ATTR_LINK: &str = "link";
const INLINE_ATTR_REFERENCE: &str = "reference";
const INLINE_ATTR_COLOR: &str = "color";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum InlineStyle {
  Bold,
  Italic,
  Underline,
  Strike,
  Code,
  Link,
  Reference,
  Color,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct InlineDelimiter {
  pub(super) open: &'static str,
  pub(super) close: &'static str,
}

impl InlineStyle {
  pub(super) fn key(self) -> &'static str {
    match self {
      InlineStyle::Bold => INLINE_ATTR_BOLD,
      InlineStyle::Italic => INLINE_ATTR_ITALIC,
      InlineStyle::Underline => INLINE_ATTR_UNDERLINE,
      InlineStyle::Strike => INLINE_ATTR_STRIKE,
      InlineStyle::Code => INLINE_ATTR_CODE,
      InlineStyle::Link => INLINE_ATTR_LINK,
      InlineStyle::Reference => INLINE_ATTR_REFERENCE,
      InlineStyle::Color => INLINE_ATTR_COLOR,
    }
  }

  pub(super) fn from_key(key: &str) -> Option<Self> {
    match key {
      INLINE_ATTR_BOLD => Some(InlineStyle::Bold),
      INLINE_ATTR_ITALIC => Some(InlineStyle::Italic),
      INLINE_ATTR_UNDERLINE => Some(InlineStyle::Underline),
      INLINE_ATTR_STRIKE => Some(InlineStyle::Strike),
      INLINE_ATTR_CODE => Some(InlineStyle::Code),
      INLINE_ATTR_LINK => Some(InlineStyle::Link),
      INLINE_ATTR_REFERENCE => Some(InlineStyle::Reference),
      INLINE_ATTR_COLOR => Some(InlineStyle::Color),
      _ => None,
    }
  }

  pub(super) fn delimiter(self) -> Option<InlineDelimiter> {
    match self {
      InlineStyle::Italic => Some(InlineDelimiter { open: "_", close: "_" }),
      InlineStyle::Bold => Some(InlineDelimiter {
        open: "**",
        close: "**",
      }),
      InlineStyle::Strike => Some(InlineDelimiter {
        open: "~~",
        close: "~~",
      }),
      InlineStyle::Code => Some(InlineDelimiter { open: "`", close: "`" }),
      InlineStyle::Link | InlineStyle::Reference | InlineStyle::Underline | InlineStyle::Color => None,
    }
  }
}
