use std::{
    collections::{BTreeSet, HashMap},
    hash::{Hash, Hasher},
    rc::Rc,
    sync::Arc,
};

use blocksuite_playground_doc::{
    read::{BlockContent, BlockNode, RichText, TextAlign as BlockAlign},
    schema::ParagraphType,
};
use ui::{FontWeight, Hsla, SharedString, TextAlign, Window};

use crate::{
    rich_text::{RichParagraph, RichParagraphStyle},
    theme::{FONT_SANS, Palette},
};

use super::*;

/// World-space page layout with per-block reuse across passes.
#[derive(Default)]
pub struct BlockFlow {
    bodies: HashMap<String, (u64, Rc<BlockBody>)>,
}

pub(super) struct FlowPass<'a> {
    pub(super) dirty: Option<&'a BTreeSet<String>>,
    pub(super) input: &'a FlowInput<'a>,
    pub(super) palette: Palette,
    pub(super) window: &'a Window,
    pub(super) previous: HashMap<String, (u64, Rc<BlockBody>)>,
    pub(super) next: HashMap<String, (u64, Rc<BlockBody>)>,
    pub(super) blocks: Vec<FlowBlock>,
    pub(super) stats: FlowStats,
    pub(super) y: f32,
    /// Bottom margin of the previous sibling, `None` at the start of a flow root.
    pub(super) pending_margin: Option<f32>,
}

impl BlockFlow {
    pub fn new() -> Self {
        Self::default()
    }

    /// Lay the snapshot out in world space, reusing the body of every block whose content,
    /// width and theme did not change since the previous pass.
    pub fn layout(&mut self, input: &FlowInput<'_>, window: &Window) -> FlowLayout {
        self.layout_changed(input, window, None)
    }

    /// The caller may identify text-only changes since the last pass when the environment
    /// and topology are identical. All other passes fingerprint each block normally.
    pub(crate) fn layout_changed(
        &mut self,
        input: &FlowInput<'_>,
        window: &Window,
        dirty: Option<&BTreeSet<String>>,
    ) -> FlowLayout {
        let mut pass = FlowPass {
            dirty,
            input,
            palette: input.theme.palette(),
            window,
            previous: std::mem::take(&mut self.bodies),
            next: HashMap::new(),
            blocks: Vec::new(),
            stats: FlowStats::default(),
            y: 0.0,
            pending_margin: None,
        };

        if let Some(root) = &input.snapshot.root {
            let title = match &root.content {
                BlockContent::Page { title } => title.plain.as_str(),
                _ => "",
            };
            let body = pass.body("\u{0}title", &("title", title), |pass| {
                pass.title_body(title)
            });
            pass.y = TITLE_SPEC.margin_top;
            pass.blocks.push(FlowBlock {
                block_id: root.id.clone(),
                snapshot_id: SharedString::from("page.title_block"),
                x: 0.0,
                y: pass.y,
                body: body.clone(),
            });
            pass.y += body.height + TITLE_SPEC.margin_bottom;

            for child in &root.children {
                if child.is_edgeless_only() {
                    continue;
                }
                // Each note is its own flow root: margins never collapse across notes.
                pass.pending_margin = None;
                match &child.content {
                    BlockContent::Note { hidden: true, .. } => continue,
                    BlockContent::Note { .. } => {
                        pass.flow(&child.children, 0.0, 0, BlockAlign::Left)
                    }
                    _ => pass.flow(std::slice::from_ref(child), 0.0, 0, BlockAlign::Left),
                }
                pass.y += pass.pending_margin.take().unwrap_or(0.0);
            }
            pass.y += BOTTOM_PADDING;
        }

        self.bodies = pass.next;
        FlowLayout {
            blocks: pass.blocks,
            width: input.width,
            height: pass.y,
            stats: pass.stats,
        }
    }

    /// Lay an arbitrary slice of block nodes out in local coordinates (no page title or bottom
    /// padding), reusing cached block bodies across passes.
    pub fn layout_nodes(
        &mut self,
        nodes: &[BlockNode],
        input: &FlowInput<'_>,
        window: &Window,
    ) -> FlowLayout {
        let mut pass = FlowPass {
            dirty: None,
            input,
            palette: input.theme.palette(),
            window,
            previous: std::mem::take(&mut self.bodies),
            next: HashMap::new(),
            blocks: Vec::new(),
            stats: FlowStats::default(),
            y: 0.0,
            pending_margin: None,
        };
        pass.flow(nodes, 0.0, 0, BlockAlign::Left);
        pass.y += pass.pending_margin.take().unwrap_or(0.0);
        self.bodies = pass.next;
        FlowLayout {
            blocks: pass.blocks,
            width: input.width,
            height: pass.y,
            stats: pass.stats,
        }
    }
}

fn heading_level(node: &BlockNode) -> Option<u8> {
    match &node.content {
        BlockContent::Paragraph { kind, .. } => match kind {
            ParagraphType::H1 => Some(1),
            ParagraphType::H2 => Some(2),
            ParagraphType::H3 => Some(3),
            ParagraphType::H4 => Some(4),
            ParagraphType::H5 => Some(5),
            ParagraphType::H6 => Some(6),
            _ => None,
        },
        _ => None,
    }
}

impl<'a> FlowPass<'a> {
    fn body(
        &mut self,
        key: &str,
        content: &dyn std::fmt::Debug,
        build: impl FnOnce(&mut Self) -> BlockBody,
    ) -> Rc<BlockBody> {
        if self.dirty.is_some_and(|ids| !ids.contains(key))
            && let Some((id, cached)) = self.previous.remove_entry(key)
        {
            self.stats.reused += 1;
            let body = cached.1.clone();
            self.next.insert(id, cached);
            return body;
        }
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        format!("{content:?}").hash(&mut hasher);
        self.input.width.to_bits().hash(&mut hasher);
        self.input.theme.hash(&mut hasher);
        self.input.env_rev.hash(&mut hasher);
        let fingerprint = hasher.finish();

        let body = match self.previous.get(key) {
            Some((previous, body)) if *previous == fingerprint => {
                self.stats.reused += 1;
                body.clone()
            }
            _ => {
                self.stats.laid_out += 1;
                Rc::new(build(self))
            }
        };
        self.next
            .insert(key.to_string(), (fingerprint, body.clone()));
        body
    }

    /// Place `nodes` as siblings at horizontal offset `x`, collapsing vertical margins.
    /// `inherited_align` is the text alignment of the nearest ancestor that sets one.
    fn flow(
        &mut self,
        nodes: &[BlockNode],
        x: f32,
        list_depth: usize,
        inherited_align: BlockAlign,
    ) {
        let mut collapsed_heading: Option<u8> = None;
        for node in nodes {
            if let Some(level) = collapsed_heading {
                match heading_level(node) {
                    Some(next) if next <= level => collapsed_heading = None,
                    _ => continue,
                }
            }
            if node.is_edgeless_only() {
                continue;
            }

            let width = (self.input.width - x).max(0.0);
            let align = match &node.content {
                BlockContent::Paragraph { text_align, .. }
                | BlockContent::List { text_align, .. } => text_align.unwrap_or(inherited_align),
                _ => inherited_align,
            };
            let fingerprint = (
                &node.content,
                node.children.is_empty(),
                width.to_bits(),
                list_depth,
                align,
            );
            let body = self.body(&node.id, &fingerprint, |pass| {
                pass.block_body(node, width, list_depth, align)
            });
            let gap = match self.pending_margin {
                None => body.margin_top,
                Some(previous) => previous.max(body.margin_top),
            };
            self.y += gap;
            self.blocks.push(FlowBlock {
                block_id: node.id.clone(),
                snapshot_id: SharedString::from(format!("page.block.{}", node.id)),
                x,
                y: self.y,
                body: body.clone(),
            });
            self.y += body.height;
            self.pending_margin = Some(body.margin_bottom);

            let (shows_children, child_depth) = match &node.content {
                BlockContent::List { collapsed, .. } => (!collapsed, list_depth + 1),
                // A collapsed heading hides its own children as well as the siblings under it.
                BlockContent::Paragraph {
                    collapsed: true, ..
                } if heading_level(node).is_some() => (false, 0),
                BlockContent::Unknown(_) => (false, 0),
                _ => (true, 0),
            };
            if shows_children && !node.children.is_empty() {
                // The block's own row has no bottom margin; the last child's bottom margin
                // collapses through the children container into the block's.
                self.pending_margin = Some(0.0);
                self.flow(&node.children, x + CHILD_INDENT, child_depth, align);
                self.pending_margin =
                    Some(self.pending_margin.unwrap_or(0.0).max(body.margin_bottom));
            }

            if let (
                Some(level),
                BlockContent::Paragraph {
                    collapsed: true, ..
                },
            ) = (heading_level(node), &node.content)
            {
                collapsed_heading = Some(level);
            }
        }
    }

    pub(super) fn plain_inline(
        &self,
        text: &str,
        style: InlineStyle,
        width: f32,
        line_height: f32,
        align: InlineAlign,
    ) -> Rc<InlineLayout> {
        Rc::new(layout_inline(
            text,
            &style,
            width,
            line_height,
            InlineBaseline::Of(&style),
            align,
            self.window,
        ))
    }

    /// Lay out a block's rich text with the shared paragraph engine, at the block's
    /// typography. A delta the engine rejects falls back to its plain string.
    pub(super) fn block_text(
        &self,
        text: &RichText,
        spec: &TextSpec,
        ink: Hsla,
        width: f32,
        align: BlockAlign,
    ) -> FlowTextLayout {
        let width = width.max(1.0);
        let paragraph = RichParagraph::from_delta_with_resolver(text.delta.clone(), |page_id| {
            self.input.page_titles.get(page_id).cloned()
        });
        match paragraph {
            Ok(paragraph) => {
                let mut style = RichParagraphStyle::from_theme(self.input.theme.mode());
                // Inline code is set 3px below the block's size; its measured box scales
                // with it.
                let code_font_size = (spec.font_size - 3.0).max(8.0);
                let code_scale = code_font_size / style.code_font_size;
                style.code_font_size = code_font_size;
                style.code_baseline *= code_scale;
                style.code_descent *= code_scale;
                style.font_size = spec.font_size;
                style.base_weight = FontWeight(spec.font_weight);
                style.line_height = spec.line_height;
                style.baseline_offset = Some(spec.baseline);
                style.letter_spacing = spec.letter_spacing;
                style.align = match align {
                    BlockAlign::Left => TextAlign::Left,
                    BlockAlign::Center => TextAlign::Center,
                    BlockAlign::Right => TextAlign::Right,
                };
                style.text_color = ink;
                FlowTextLayout::Rich(Arc::new(paragraph.layout(
                    self.window.text_system(),
                    &style,
                    width,
                )))
            }
            Err(_) => FlowTextLayout::Plain(Rc::new(layout_inline(
                &text.plain,
                &InlineStyle::new(FONT_SANS, spec.font_size, spec.font_weight, ink),
                width,
                spec.line_height,
                InlineBaseline::At(spec.baseline),
                match align {
                    BlockAlign::Left => InlineAlign::Left,
                    BlockAlign::Center => InlineAlign::Center,
                    BlockAlign::Right => InlineAlign::Right,
                },
                self.window,
            ))),
        }
    }

    fn title_body(&mut self, title: &str) -> BlockBody {
        let width = self.input.width;
        let (text, color) = if title.is_empty() {
            ("Title", self.palette.placeholder.opacity(0.5))
        } else {
            (title, self.palette.text_primary)
        };
        let style = InlineStyle::new(
            FONT_SANS,
            TITLE_SPEC.font_size,
            TITLE_SPEC.font_weight,
            color,
        );
        let layout = Rc::new(layout_inline(
            text,
            &style,
            width,
            TITLE_SPEC.line_height,
            InlineBaseline::At(TITLE_SPEC.baseline),
            InlineAlign::Left,
            self.window,
        ));
        BlockBody {
            kind: FlowKind::Title,
            width,
            height: layout.height(),
            margin_top: TITLE_SPEC.margin_top,
            margin_bottom: TITLE_SPEC.margin_bottom,
            plain: text.to_string(),
            prims: vec![Prim::Text {
                x: 0.0,
                y: 0.0,
                layout: layout.clone(),
                clip: None,
            }],
            text: Some(FlowText {
                x: 0.0,
                y: 0.0,
                layout: FlowTextLayout::Plain(layout),
            }),
            prefix: None,
            code_scroll: None,
        }
    }

    fn block_body(
        &mut self,
        node: &BlockNode,
        width: f32,
        list_depth: usize,
        align: BlockAlign,
    ) -> BlockBody {
        match &node.content {
            BlockContent::Paragraph {
                kind,
                text,
                collapsed,
                ..
            } => self.paragraph_body(*kind, text, *collapsed, width, align),
            BlockContent::List {
                kind,
                checked,
                collapsed,
                text,
                numbered_index,
                ..
            } => self.list_body(
                *kind,
                *checked,
                *collapsed && !node.children.is_empty(),
                text,
                numbered_index.unwrap_or(1),
                list_depth,
                width,
                align,
            ),
            BlockContent::Divider => self.divider_body(width),
            BlockContent::Code {
                language,
                wrap,
                text,
                caption,
            } => self.code_body(language, *wrap, text, caption, width),
            BlockContent::Image {
                source_id,
                width: image_width,
                height: image_height,
                caption,
            } => self.image_body(source_id, *image_width, *image_height, caption, width),
            BlockContent::Bookmark {
                url,
                title,
                description,
                caption,
            } => self.bookmark_body(
                url,
                title.as_deref(),
                description.as_deref(),
                caption,
                width,
            ),
            _ => self.unknown_body(&node.flavour, &node.id, width),
        }
    }
}
