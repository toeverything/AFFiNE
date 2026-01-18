use std::{
  cell::RefCell,
  collections::{HashMap, HashSet},
  rc::{Rc, Weak},
};

use y_octo::{AHashMap, Any, Map, Text, TextAttributes, TextDeltaOp, TextInsert, Value};

use super::{
  super::value::{
    any_as_string, any_as_u64, any_truthy, build_reference_payload, params_any_map_to_json, value_to_any,
  },
  inline::InlineStyle,
};

#[derive(Debug, Clone)]
struct InlineReference {
  ref_type: Option<String>,
  page_id: String,
  title: Option<String>,
  params: Option<AHashMap<String, Any>>,
  mode: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct InlineReferencePayload {
  pub(crate) doc_id: String,
  pub(crate) payload: String,
}

#[derive(Debug, Clone)]
pub(crate) struct DeltaToMdOptions {
  doc_url_prefix: Option<String>,
}

impl DeltaToMdOptions {
  pub(crate) fn new(doc_url_prefix: Option<String>) -> Self {
    Self { doc_url_prefix }
  }

  fn build_reference_link(&self, reference: &InlineReference) -> (String, String) {
    let title = reference.title.clone().unwrap_or_default();

    if let Some(prefix) = self.doc_url_prefix.as_deref() {
      let prefix = prefix.trim_end_matches('/');
      return (title, format!("{}/{}", prefix, reference.page_id));
    }

    let mut parts = Vec::new();
    parts.push(reference.ref_type.clone().unwrap_or_else(|| "LinkedPage".into()));
    parts.push(reference.page_id.clone());
    if let Some(mode) = reference.mode.as_ref() {
      parts.push(mode.clone());
    }

    (title, parts.join(":"))
  }
}

pub(crate) fn text_to_inline_markdown(block: &Map, key: &str, options: &DeltaToMdOptions) -> Option<String> {
  block
    .get(key)
    .and_then(|value| value.to_text())
    .map(|text| delta_to_inline_markdown(&text, options))
}

pub(crate) fn delta_ops_to_markdown(ops: &[TextDeltaOp], options: &DeltaToMdOptions) -> String {
  delta_to_markdown_with_options(ops, options, true)
}

pub(crate) fn delta_ops_to_plain_text(ops: &[TextDeltaOp]) -> String {
  let mut out = String::new();
  for op in ops {
    if let TextDeltaOp::Insert {
      insert: TextInsert::Text(text),
      ..
    } = op
    {
      out.push_str(text);
    }
  }
  out
}

pub(crate) fn extract_inline_references(delta: &[TextDeltaOp]) -> Vec<InlineReferencePayload> {
  let mut refs = Vec::new();
  let mut seen: HashSet<(String, String)> = HashSet::new();

  for op in delta {
    let attrs = match op {
      TextDeltaOp::Insert {
        format: Some(format), ..
      } => format,
      _ => continue,
    };

    let reference = match attrs.get(InlineStyle::Reference.key()).and_then(parse_inline_reference) {
      Some(reference) => reference,
      None => continue,
    };

    let payload = match inline_reference_payload(&reference) {
      Some(payload) => payload,
      None => continue,
    };

    let key = (reference.page_id.clone(), payload.clone());
    if seen.insert(key.clone()) {
      refs.push(InlineReferencePayload {
        doc_id: key.0,
        payload: key.1,
      });
    }
  }

  refs
}

pub(crate) fn extract_inline_references_from_value(value: &Value) -> Vec<InlineReferencePayload> {
  if let Some(text) = value.to_text() {
    return extract_inline_references(&text.to_delta());
  }

  let Some(any) = value_to_any(value) else {
    return Vec::new();
  };

  extract_inline_references_from_any(&any)
}

fn extract_inline_references_from_any(value: &Any) -> Vec<InlineReferencePayload> {
  let Some(ops) = delta_ops_from_any(value) else {
    return Vec::new();
  };

  let mut refs = Vec::new();
  let mut seen: HashSet<(String, String)> = HashSet::new();

  for op in ops {
    let reference = match op
      .attributes
      .get(InlineStyle::Reference.key())
      .and_then(parse_inline_reference)
    {
      Some(reference) => reference,
      None => continue,
    };

    let payload = match inline_reference_payload(&reference) {
      Some(payload) => payload,
      None => continue,
    };

    let key = (reference.page_id.clone(), payload.clone());
    if seen.insert(key.clone()) {
      refs.push(InlineReferencePayload {
        doc_id: key.0,
        payload: key.1,
      });
    }
  }

  refs
}

fn parse_inline_reference(value: &Any) -> Option<InlineReference> {
  let map = match value {
    Any::Object(map) => map,
    _ => return None,
  };

  let page_id = map.get("pageId").and_then(any_as_string).map(str::to_string)?;
  let title = map.get("title").and_then(any_as_string).map(str::to_string);
  let ref_type = map.get("type").and_then(any_as_string).map(str::to_string);
  let params = map.get("params").and_then(|value| match value {
    Any::Object(map) => Some(map.clone()),
    _ => None,
  });
  let mode = params
    .as_ref()
    .and_then(|params| params.get("mode"))
    .and_then(any_as_string)
    .map(str::to_string);

  Some(InlineReference {
    ref_type,
    page_id,
    title,
    params,
    mode,
  })
}

fn inline_reference_payload(reference: &InlineReference) -> Option<String> {
  let params = reference.params.as_ref().map(params_any_map_to_json);
  Some(build_reference_payload(&reference.page_id, params))
}

fn delta_to_inline_markdown(text: &Text, options: &DeltaToMdOptions) -> String {
  delta_to_markdown_with_options(&text.to_delta(), options, false)
}

fn delta_to_markdown_with_options(delta: &[TextDeltaOp], options: &DeltaToMdOptions, trailing_newline: bool) -> String {
  let ops = build_delta_ops(delta);
  delta_ops_to_markdown_with_options(&ops, options, trailing_newline)
}

fn delta_ops_to_markdown_with_options(ops: &[DeltaOp], options: &DeltaToMdOptions, trailing_newline: bool) -> String {
  let root = convert_delta_ops(ops, options);
  let mut rendered = render_node(&root);
  rendered = rendered.trim_end().to_string();
  if trailing_newline {
    rendered.push('\n');
  }
  rendered
}

#[derive(Debug, Clone)]
struct DeltaOp {
  insert: DeltaInsert,
  attributes: TextAttributes,
}

#[derive(Debug, Clone)]
enum DeltaInsert {
  Text(String),
  Embed(Vec<Any>),
}

fn delta_ops_from_any(value: &Any) -> Option<Vec<DeltaOp>> {
  let map = match value {
    Any::Object(map) => map,
    _ => return None,
  };
  match map.get("$blocksuite:internal:text$") {
    Some(Any::True) => {}
    _ => return None,
  }

  let delta = map.get("delta")?;
  let entries = match delta {
    Any::Array(entries) => entries,
    _ => return None,
  };

  let mut ops = Vec::new();
  for entry in entries {
    if let Some(op) = delta_op_from_any(entry) {
      ops.push(op);
    }
  }

  Some(ops)
}

fn delta_op_from_any(value: &Any) -> Option<DeltaOp> {
  let map = match value {
    Any::Object(map) => map,
    _ => return None,
  };

  let insert_value = map.get("insert")?;
  let insert = match insert_value {
    Any::String(text) => DeltaInsert::Text(text.clone()),
    Any::Array(values) => DeltaInsert::Embed(values.clone()),
    _ => DeltaInsert::Embed(vec![insert_value.clone()]),
  };

  let attributes = map.get("attributes").and_then(any_to_attributes).unwrap_or_default();

  Some(DeltaOp { insert, attributes })
}

fn any_to_attributes(value: &Any) -> Option<TextAttributes> {
  let map = match value {
    Any::Object(map) => map,
    _ => return None,
  };

  let mut attrs = TextAttributes::new();
  for (key, value) in map.iter() {
    attrs.insert(key.clone(), value.clone());
  }
  Some(attrs)
}

fn delta_any_to_inline_markdown(value: &Any, options: &DeltaToMdOptions) -> Option<String> {
  delta_ops_from_any(value).map(|ops| delta_ops_to_markdown_with_options(&ops, options, false))
}

pub(crate) fn delta_value_to_inline_markdown(value: &Value, options: &DeltaToMdOptions) -> Option<String> {
  if let Some(text) = value.to_text() {
    return Some(delta_to_inline_markdown(&text, options));
  }

  let any = value_to_any(value)?;
  delta_any_to_inline_markdown(&any, options)
}

fn build_delta_ops(delta: &[TextDeltaOp]) -> Vec<DeltaOp> {
  let mut ops = Vec::new();

  for op in delta {
    let (insert, attrs) = match op {
      TextDeltaOp::Insert { insert, format } => (insert, format.clone().unwrap_or_default()),
      _ => continue,
    };

    match insert {
      TextInsert::Text(text) => ops.push(DeltaOp {
        insert: DeltaInsert::Text(text.clone()),
        attributes: attrs,
      }),
      TextInsert::Embed(values) => ops.push(DeltaOp {
        insert: DeltaInsert::Embed(values.clone()),
        attributes: attrs,
      }),
    }
  }

  ops
}

#[derive(Debug)]
struct Group {
  node: Rc<RefCell<Node>>,
  kind: String,
  distance: usize,
  count: usize,
}

fn convert_delta_ops(ops: &[DeltaOp], options: &DeltaToMdOptions) -> Rc<RefCell<Node>> {
  let root = Node::new_root();
  let mut group: Option<Group> = None;
  let mut active_inline: HashMap<String, Any> = HashMap::new();
  let mut beginning_of_line = false;

  let mut line = Node::new_line();
  let mut el = line.clone();
  Node::append(&root, line.clone());

  for index in 0..ops.len() {
    let op = &ops[index];
    let next_attrs = ops.get(index + 1).map(|next| &next.attributes);

    match &op.insert {
      DeltaInsert::Embed(values) => {
        apply_inline_attributes(&mut el, &op.attributes, None, &mut active_inline, options);
        for value in values {
          match value {
            Any::Object(map) => {
              for (key, value) in map.iter() {
                match key.as_str() {
                  "image" => {
                    if let Some(src) = any_as_string(value) {
                      let url = encode_link(src);
                      Node::append(&el, Node::new_text(&format!("![]({url})")));
                    }
                  }
                  "thematic_break" => {
                    let current_open = el.borrow().open.clone();
                    el.borrow_mut().open = format!("\n---\n{current_open}");
                  }
                  _ => {}
                }
              }
            }
            Any::String(value) => {
              Node::append(&el, Node::new_text(value));
            }
            _ => {}
          }
        }
      }
      DeltaInsert::Text(text) => {
        let lines: Vec<&str> = text.split('\n').collect();
        if has_block_level_attribute(&op.attributes) {
          for _ in 1..lines.len() {
            for (attr, value) in op.attributes.iter() {
              match attr.as_str() {
                "header" => {
                  if let Some(level) = any_as_u64(value) {
                    let prefix = "#".repeat(level as usize);
                    let current_open = line.borrow().open.clone();
                    line.borrow_mut().open = format!("{prefix} {current_open}");
                    new_line(&root, &mut line, &mut el, &mut active_inline);
                    break;
                  }
                }
                "blockquote" => {
                  let current_open = line.borrow().open.clone();
                  line.borrow_mut().open = format!("> {current_open}");
                  new_line(&root, &mut line, &mut el, &mut active_inline);
                  break;
                }
                "list" => {
                  if group.as_ref().is_some_and(|g| g.kind != attr.as_str()) {
                    group = None;
                  }
                  if group.is_none() {
                    let group_node = Node::new_line();
                    Node::append(&root, group_node.clone());
                    group = Some(Group {
                      node: group_node,
                      kind: attr.to_string(),
                      distance: 0,
                      count: 0,
                    });
                  }

                  if let Some(group) = group.as_mut() {
                    Node::append(&group.node, line.clone());
                    group.distance = 0;
                    match any_as_string(value) {
                      Some("bullet") => {
                        let current_open = line.borrow().open.clone();
                        line.borrow_mut().open = format!("- {current_open}");
                      }
                      Some("checked") => {
                        let current_open = line.borrow().open.clone();
                        line.borrow_mut().open = format!("- [x] {current_open}");
                      }
                      Some("unchecked") => {
                        let current_open = line.borrow().open.clone();
                        line.borrow_mut().open = format!("- [ ] {current_open}");
                      }
                      Some("ordered") => {
                        group.count += 1;
                        let current_open = line.borrow().open.clone();
                        line.borrow_mut().open = format!("{}. {}", group.count, current_open);
                      }
                      _ => {}
                    }
                  }

                  new_line(&root, &mut line, &mut el, &mut active_inline);
                  break;
                }
                _ => {}
              }
            }
          }
          beginning_of_line = true;
        } else {
          for (line_index, segment) in lines.iter().enumerate() {
            if (line_index > 0 || beginning_of_line) && group.is_some() {
              let reset_group = group.as_mut().map(|group| {
                group.distance += 1;
                group.distance >= 2
              });
              if reset_group == Some(true) {
                group = None;
              }
            }

            apply_inline_attributes(&mut el, &op.attributes, next_attrs, &mut active_inline, options);
            Node::append(&el, Node::new_text(segment));
            if line_index + 1 < lines.len() {
              new_line(&root, &mut line, &mut el, &mut active_inline);
            }
          }
          beginning_of_line = false;
        }
      }
    }
  }

  root
}

fn apply_inline_attributes(
  el: &mut Rc<RefCell<Node>>,
  attrs: &TextAttributes,
  next: Option<&TextAttributes>,
  active_inline: &mut HashMap<String, Any>,
  options: &DeltaToMdOptions,
) {
  let mut first = Vec::new();
  let mut then = Vec::new();
  let mut seen: HashSet<String> = HashSet::new();

  let mut tag = el.clone();
  loop {
    let format = match tag.borrow().format.clone() {
      Some(format) => format,
      None => break,
    };
    seen.insert(format.clone());

    let should_close = match attrs.get(&format) {
      Some(value) => !any_truthy(value) || tag.borrow().open != tag.borrow().close,
      None => true,
    };

    if should_close {
      for key in seen.iter() {
        active_inline.remove(key);
      }
      let parent = {
        let tag_ref = tag.borrow();
        tag_ref.parent.as_ref().and_then(|p| p.upgrade())
      };
      if let Some(parent) = parent {
        *el = parent.clone();
        tag = parent;
        continue;
      }
      break;
    }

    let parent = {
      let tag_ref = tag.borrow();
      tag_ref.parent.as_ref().and_then(|p| p.upgrade())
    };
    if let Some(parent) = parent {
      tag = parent;
    } else {
      break;
    }
  }

  for (attr, value) in attrs.iter() {
    if !is_inline_attribute(attr) || !any_truthy(value) {
      continue;
    }
    if let Some(active) = active_inline.get(attr)
      && active == value
    {
      continue;
    }

    let next_matches = next
      .and_then(|next_attrs| next_attrs.get(attr))
      .map(|next_value| next_value == value)
      .unwrap_or(false);

    if next_matches {
      first.push(attr.clone());
    } else {
      then.push(attr.clone());
    }
    active_inline.insert(attr.clone(), value.clone());
  }

  for attr in first.into_iter().chain(then) {
    if let Some(node) = inline_node_for_attr(&attr, attrs, options) {
      node.borrow_mut().format = Some(attr.clone());
      Node::append(el, node.clone());
      *el = node;
    }
  }
}

fn inline_node_for_attr(attr: &str, attrs: &TextAttributes, options: &DeltaToMdOptions) -> Option<Rc<RefCell<Node>>> {
  let style = InlineStyle::from_key(attr)?;
  if let Some(delimiter) = style.delimiter() {
    return Some(Node::new_inline(delimiter.open, delimiter.close));
  }

  match style {
    InlineStyle::Underline => Some(Node::new_inline("<u>", "</u>")),
    InlineStyle::Color => {
      let color = attrs.get(attr).and_then(any_as_string)?.trim();
      if color.is_empty() {
        None
      } else {
        Some(Node::new_inline(&format!("<span style=\"color: {color}\">"), "</span>"))
      }
    }
    InlineStyle::Link => attrs
      .get(attr)
      .and_then(any_as_string)
      .map(|url| Node::new_inline("[", &format!("]({url})"))),
    InlineStyle::Reference => attrs.get(attr).and_then(parse_inline_reference).map(|reference| {
      let (title, link) = options.build_reference_link(&reference);
      Node::new_inline("[", &format!("{title}]({link})"))
    }),
    _ => None,
  }
}

fn has_block_level_attribute(attrs: &TextAttributes) -> bool {
  attrs.contains_key("header") || attrs.contains_key("blockquote") || attrs.contains_key("list")
}

fn is_inline_attribute(attr: &str) -> bool {
  InlineStyle::from_key(attr).is_some()
}

fn encode_link(link: &str) -> String {
  const HEX: &[u8; 16] = b"0123456789abcdef";

  #[inline]
  fn push_pct(out: &mut String, b: u8) {
    out.push('%');
    out.push(HEX[(b >> 4) as usize] as char);
    out.push(HEX[(b & 0x0f) as usize] as char);
  }

  #[inline]
  fn is_allowed(b: u8) -> bool {
    matches!(
        b,
        b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b';'
            | b','
            | b'/'
            | b'?'
            | b':'
            | b'@'
            | b'&'
            | b'='
            | b'+'
            | b'$'
            | b'#'
    )
  }

  let mut out = String::with_capacity(link.len());

  for &b in link.as_bytes() {
    match b {
      b'(' | b')' => push_pct(&mut out, b),
      b if is_allowed(b) => out.push(b as char),
      b => push_pct(&mut out, b),
    }
  }

  if let Some(i) = out.find("?response-content-disposition=attachment") {
    out.truncate(i);
  } else if let Some(i) = out.find("&response-content-disposition=attachment") {
    out.truncate(i);
  }

  out
}

#[derive(Debug)]
struct Node {
  open: String,
  close: String,
  text: String,
  children: Vec<Rc<RefCell<Node>>>,
  parent: Option<Weak<RefCell<Node>>>,
  format: Option<String>,
}

impl Node {
  fn new_root() -> Rc<RefCell<Node>> {
    Rc::new(RefCell::new(Node {
      open: String::new(),
      close: String::new(),
      text: String::new(),
      children: Vec::new(),
      parent: None,
      format: None,
    }))
  }

  fn new_inline(open: &str, close: &str) -> Rc<RefCell<Node>> {
    Rc::new(RefCell::new(Node {
      open: open.to_string(),
      close: close.to_string(),
      text: String::new(),
      children: Vec::new(),
      parent: None,
      format: None,
    }))
  }

  fn new_text(text: &str) -> Rc<RefCell<Node>> {
    Rc::new(RefCell::new(Node {
      open: String::new(),
      close: String::new(),
      text: text.to_string(),
      children: Vec::new(),
      parent: None,
      format: None,
    }))
  }

  fn new_line() -> Rc<RefCell<Node>> {
    Rc::new(RefCell::new(Node {
      open: String::new(),
      close: "\n".to_string(),
      text: String::new(),
      children: Vec::new(),
      parent: None,
      format: None,
    }))
  }

  fn append(parent: &Rc<RefCell<Node>>, child: Rc<RefCell<Node>>) {
    if let Some(old_parent) = child.borrow().parent.as_ref().and_then(|p| p.upgrade()) {
      let mut old_parent = old_parent.borrow_mut();
      old_parent.children.retain(|existing| !Rc::ptr_eq(existing, &child));
    }

    child.borrow_mut().parent = Some(Rc::downgrade(parent));
    parent.borrow_mut().children.push(child);
  }
}

fn render_node(node: &Rc<RefCell<Node>>) -> String {
  let node_ref = node.borrow();
  let mut inner = node_ref.text.clone();
  for child in node_ref.children.iter() {
    inner.push_str(&render_node(child));
  }

  if inner.trim().is_empty()
    && node_ref.open == node_ref.close
    && !node_ref.open.is_empty()
    && !node_ref.close.is_empty()
  {
    return String::new();
  }

  let wrapped = !node_ref.open.is_empty() && !node_ref.close.is_empty();
  let empty_inner = inner.trim().is_empty();
  let mut fragments = Vec::new();

  if inner.starts_with(' ') && !empty_inner && wrapped {
    fragments.push(" ".to_string());
  }
  if !node_ref.open.is_empty() {
    fragments.push(node_ref.open.clone());
  }
  fragments.push(if wrapped {
    inner.trim().to_string()
  } else {
    inner.clone()
  });
  if !node_ref.close.is_empty() {
    fragments.push(node_ref.close.clone());
  }
  if inner.ends_with(' ') && !empty_inner && wrapped {
    fragments.push(" ".to_string());
  }

  fragments.join("")
}

fn new_line(
  root: &Rc<RefCell<Node>>,
  line: &mut Rc<RefCell<Node>>,
  el: &mut Rc<RefCell<Node>>,
  active_inline: &mut HashMap<String, Any>,
) {
  *line = Node::new_line();
  *el = line.clone();
  Node::append(root, line.clone());
  active_inline.clear();
}

#[cfg(test)]
mod tests {
  use serde_json::Value;
  use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

  use super::*;

  #[test]
  fn test_delta_to_inline_markdown_link() {
    let mut attrs = TextAttributes::new();
    attrs.insert(
      InlineStyle::Link.key().into(),
      Any::String("https://example.com".into()),
    );

    let delta = vec![TextDeltaOp::Insert {
      insert: TextInsert::Text("AFFiNE".into()),
      format: Some(attrs),
    }];

    let options = DeltaToMdOptions::new(None);
    let rendered = delta_to_markdown_with_options(&delta, &options, false);
    assert_eq!(rendered, "[AFFiNE](https://example.com)");
  }

  #[test]
  fn test_extract_inline_references_payload() {
    let mut ref_map = AHashMap::default();
    ref_map.insert("pageId".into(), Any::String("doc123".into()));
    ref_map.insert("title".into(), Any::String("Doc Title".into()));
    ref_map.insert("type".into(), Any::String("LinkedPage".into()));

    let mut attrs = TextAttributes::new();
    attrs.insert(InlineStyle::Reference.key().into(), Any::Object(ref_map));

    let delta = vec![TextDeltaOp::Insert {
      insert: TextInsert::Text("Doc Title".into()),
      format: Some(attrs),
    }];

    let refs = extract_inline_references(&delta);
    assert_eq!(refs.len(), 1);
    assert_eq!(refs[0].doc_id, "doc123");

    let payload: Value = serde_json::from_str(&refs[0].payload).unwrap();
    assert_eq!(payload, serde_json::json!({ "docId": "doc123" }));
  }

  #[test]
  fn test_delta_to_inline_markdown_underline() {
    let mut attrs = TextAttributes::new();
    attrs.insert(InlineStyle::Underline.key().into(), Any::True);

    let delta = vec![TextDeltaOp::Insert {
      insert: TextInsert::Text("Under".into()),
      format: Some(attrs),
    }];

    let options = DeltaToMdOptions::new(None);
    let rendered = delta_to_markdown_with_options(&delta, &options, false);
    assert_eq!(rendered, "<u>Under</u>");
  }

  #[test]
  fn test_delta_to_inline_markdown_color() {
    let mut attrs = TextAttributes::new();
    attrs.insert(InlineStyle::Color.key().into(), Any::String("red".into()));

    let delta = vec![TextDeltaOp::Insert {
      insert: TextInsert::Text("Red".into()),
      format: Some(attrs),
    }];

    let options = DeltaToMdOptions::new(None);
    let rendered = delta_to_markdown_with_options(&delta, &options, false);
    assert_eq!(rendered, "<span style=\"color: red\">Red</span>");
  }
}
