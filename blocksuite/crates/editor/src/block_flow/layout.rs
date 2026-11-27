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
    database_hits: HashMap<String, Vec<crate::database::DatabaseHitTarget>>,
    pub database_state: crate::database::DatabaseFlowState,
}

pub(super) struct FlowPass<'a> {
    pub(super) dirty: Option<&'a BTreeSet<String>>,
    pub(super) input: &'a FlowInput<'a>,
    pub(super) palette: Palette,
    pub(super) window: &'a Window,
    pub(super) direction: ui::Direction,
    pub(super) previous: HashMap<String, (u64, Rc<BlockBody>)>,
    pub(super) next: HashMap<String, (u64, Rc<BlockBody>)>,
    pub(super) database_state: &'a crate::database::DatabaseFlowState,
    pub(super) database_hits: HashMap<String, Vec<crate::database::DatabaseHitTarget>>,
    pub(super) blocks: Vec<FlowBlock>,
    pub(super) stats: FlowStats,
    pub(super) y: f32,
    /// Bottom margin of the previous sibling, `None` at the start of a flow root.
    pub(super) pending_margin: Option<f32>,
    pub(super) embed_depth: usize,
    pub(super) visited_embeds: BTreeSet<String>,
}

impl BlockFlow {
    pub fn new() -> Self {
        Self::default()
    }

    /// Clickable regions recorded for `block_id` during the latest layout pass.
    pub fn database_hits(&self, block_id: &str) -> &[crate::database::DatabaseHitTarget] {
        self.database_hits.get(block_id).map_or(&[], Vec::as_slice)
    }

    /// Lay the snapshot out in world space, reusing the body of every block whose content,
    /// width and theme did not change since the previous pass.
    pub fn layout(&mut self, input: &FlowInput<'_>, window: &Window) -> FlowLayout {
        self.layout_changed(input, window, None)
    }

    /// The caller may identify text-only changes since the last pass when the environment
    /// and topology are identical. All other passes fingerprint each block normally.
    pub fn layout_changed(
        &mut self,
        input: &FlowInput<'_>,
        window: &Window,
        dirty: Option<&BTreeSet<String>>,
    ) -> FlowLayout {
        let direction = input.direction;
        let default_align = match direction {
            ui::Direction::Ltr => BlockAlign::Left,
            ui::Direction::Rtl => BlockAlign::Right,
        };
        let mut pass = FlowPass {
            dirty,
            input,
            palette: input.theme.palette(),
            window,
            direction,
            previous: std::mem::take(&mut self.bodies),
            next: HashMap::new(),
            database_state: &self.database_state,
            database_hits: std::mem::take(&mut self.database_hits),
            blocks: Vec::new(),
            stats: FlowStats::default(),
            y: 0.0,
            pending_margin: None,
            embed_depth: 0,
            visited_embeds: BTreeSet::new(),
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
                has_gutter_chevron: false,
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
                        pass.flow(&child.children, 0.0, input.width, 0, default_align)
                    }
                    _ => pass.flow(
                        std::slice::from_ref(child),
                        0.0,
                        input.width,
                        0,
                        default_align,
                    ),
                }
                pass.y += pass.pending_margin.take().unwrap_or(0.0);
            }
            pass.y += BOTTOM_PADDING;
        }

        self.bodies = pass.next;
        self.database_hits = pass.database_hits;
        FlowLayout {
            blocks: pass.blocks,
            width: input.width,
            height: pass.y,
            direction,
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
        self.layout_nodes_nested(nodes, input, window, 0, BTreeSet::new())
    }

    pub(super) fn layout_nodes_nested(
        &mut self,
        nodes: &[BlockNode],
        input: &FlowInput<'_>,
        window: &Window,
        embed_depth: usize,
        visited_embeds: BTreeSet<String>,
    ) -> FlowLayout {
        let direction = input.direction;
        let default_align = match direction {
            ui::Direction::Ltr => BlockAlign::Left,
            ui::Direction::Rtl => BlockAlign::Right,
        };
        let mut pass = FlowPass {
            dirty: None,
            input,
            palette: input.theme.palette(),
            window,
            direction,
            previous: std::mem::take(&mut self.bodies),
            next: HashMap::new(),
            database_state: &self.database_state,
            database_hits: std::mem::take(&mut self.database_hits),
            blocks: Vec::new(),
            stats: FlowStats::default(),
            y: 0.0,
            pending_margin: None,
            embed_depth,
            visited_embeds,
        };
        pass.flow(nodes, 0.0, input.width, 0, default_align);
        pass.y += pass.pending_margin.take().unwrap_or(0.0);
        self.bodies = pass.next;
        self.database_hits = pass.database_hits;
        FlowLayout {
            blocks: pass.blocks,
            width: input.width,
            height: pass.y,
            direction,
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

fn node_has_gutter_chevron(kind: FlowKind, node: &BlockNode) -> bool {
    use blocksuite_playground_doc::schema::ListType;
    if heading_level(node).is_some() {
        return true;
    }
    let supports_fold = matches!(
        kind,
        FlowKind::Paragraph(ParagraphType::Text | ParagraphType::Quote)
            | FlowKind::List(ListType::Bulleted | ListType::Numbered | ListType::Todo)
    );
    supports_fold
        && (!node.children.is_empty()
            || matches!(
                node.content,
                BlockContent::List {
                    collapsed: true,
                    ..
                } | BlockContent::Paragraph {
                    collapsed: true,
                    ..
                }
            ))
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
        self.direction.is_rtl().hash(&mut hasher);
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

    /// Place `nodes` as siblings at horizontal offset `x` within `max_right`, collapsing
    /// vertical margins. `inherited_align` is the text alignment of the nearest ancestor
    /// that sets one.
    fn flow(
        &mut self,
        nodes: &[BlockNode],
        x: f32,
        max_right: f32,
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

            let width = (max_right - x).max(0.0);
            let block_x = match self.direction {
                ui::Direction::Ltr => x,
                ui::Direction::Rtl => (self.input.width - max_right).max(0.0),
            };
            let align = match &node.content {
                BlockContent::Paragraph { text_align, .. }
                | BlockContent::List { text_align, .. } => text_align.unwrap_or(inherited_align),
                _ => inherited_align,
            };
            let draft_for_node = self.input.equation_draft.filter(|d| match d {
                EquationDraft::Block { block_id, .. } | EquationDraft::Inline { block_id, .. } => {
                    block_id == &node.id
                }
            });
            let preview_rev = super::preview::node_preview_fingerprint(
                node,
                draft_for_node,
                self.input.pdf_previews,
            );
            let embed_preview = match &node.content {
                BlockContent::EmbedLinkedDoc { page_id, .. }
                | BlockContent::EmbedSyncedDoc { page_id, .. } => {
                    self.input.doc_directory.and_then(|dir| {
                        dir.doc_preview(&crate::directory::EditorDocId::from(page_id.as_str()))
                    })
                }
                _ => None,
            };
            let surface_ref_sig = match &node.content {
                BlockContent::SurfaceRef { reference, .. }
                    if !(self.dirty.is_some_and(|ids| !ids.contains(&node.id))
                        && self.previous.contains_key(&node.id)) =>
                {
                    super::surface_ref::surface_ref_fingerprint(
                        self.input.snapshot,
                        reference,
                        &node.id,
                    )
                }
                _ => 0,
            };
            let block_utc_offset = embed_preview
                .as_ref()
                .filter(|p| p.updated_at_ms > 0)
                .map_or(self.input.utc_offset_minutes, |p| {
                    self.input.utc_offset_for(p.updated_at_ms)
                });
            let db_sig = matches!(node.content, BlockContent::Database(_)).then(|| {
                let offset_min = self.input.utc_offset_for(self.database_state.clock_ms);
                let today_day = (self
                    .database_state
                    .clock_ms
                    .saturating_add(i64::from(offset_min) * 60_000))
                .div_euclid(86_400_000);
                (
                    self.database_state.state_for(&node.id),
                    self.database_state.mobile_readonly,
                    today_day,
                )
            });
            let fingerprint = (
                &node.content,
                node.children.is_empty(),
                width.to_bits(),
                list_depth,
                align,
                preview_rev,
                draft_for_node,
                embed_preview,
                block_utc_offset,
                surface_ref_sig,
                db_sig,
            );
            let body = self.body(&node.id, &fingerprint, |pass| {
                pass.block_body(node, width, list_depth, align)
            });
            let gap = match self.pending_margin {
                None => body.margin_top,
                Some(previous) => previous.max(body.margin_top),
            };
            self.y += gap;
            let block_idx = self.blocks.len();
            let block_top = self.y;
            let is_callout = matches!(node.content, BlockContent::Callout { .. });
            let callout_has_own_text = matches!(
                &node.content,
                BlockContent::Callout { text, .. } if !text.plain.trim().is_empty()
            );
            self.blocks.push(FlowBlock {
                block_id: node.id.clone(),
                snapshot_id: SharedString::from(format!("page.block.{}", node.id)),
                x: block_x,
                y: self.y,
                has_gutter_chevron: node_has_gutter_chevron(body.kind, node),
                body: body.clone(),
            });
            self.y += body.height;
            self.pending_margin = Some(body.margin_bottom);

            let (shows_children, child_depth) = match &node.content {
                BlockContent::List { collapsed, .. } => (!collapsed, list_depth + 1),
                BlockContent::Paragraph { collapsed, .. } => (!collapsed, 0),
                BlockContent::Database(_) | BlockContent::Unknown(_) => (false, 0),
                _ => (true, 0),
            };
            if shows_children && !node.children.is_empty() {
                if is_callout {
                    // Horizontal callout layout (`callout-block-styles.ts`):
                    // emoji sits at `(x + 10, block_top + 5)` and child content starts on the
                    // SAME row at `(x + 44, block_top + 5)` with width `width - 54`.
                    let pad_top = super::rich_blocks::CALLOUT_PAD_Y;
                    let pad_x = super::rich_blocks::CALLOUT_PAD_X;
                    let content_indent = pad_x
                        + super::rich_blocks::CALLOUT_ICON_SLOT
                        + super::rich_blocks::CALLOUT_CONTENT_GAP;
                    let start_y = if callout_has_own_text {
                        self.y
                    } else {
                        block_top + pad_top
                    };
                    self.y = start_y;
                    self.pending_margin = None;
                    let child_start_idx = self.blocks.len();
                    let child_x = x + content_indent;
                    let child_max_right = (x + width - pad_x).max(child_x + 1.0);
                    self.flow(&node.children, child_x, child_max_right, child_depth, align);
                    // Suppress top margin of the first child so it aligns directly with the emoji.
                    if !callout_has_own_text
                        && let Some(first_child) = self.blocks.get(child_start_idx)
                    {
                        let shift_up = first_child.y - start_y;
                        if shift_up > 0.0 {
                            for child_blk in &mut self.blocks[child_start_idx..] {
                                child_blk.y -= shift_up;
                            }
                            self.y -= shift_up;
                        }
                    }
                    let content_bottom = self.blocks[child_start_idx..]
                        .iter()
                        .map(|b| b.rect().bottom())
                        .fold(start_y, f32::max);
                    let wrapped_h = (content_bottom - block_top + pad_top)
                        .max(super::rich_blocks::CALLOUT_MIN_HEIGHT);
                    let mut wrapped = (*self.blocks[block_idx].body).clone();
                    wrapped.height = wrapped_h;
                    if let Some(Prim::Quad { rect, .. }) = wrapped.prims.first_mut() {
                        rect.h = wrapped_h;
                    }
                    self.blocks[block_idx].body = Rc::new(wrapped);
                    self.y = block_top + wrapped_h;
                    self.pending_margin = Some(super::rich_blocks::CALLOUT_MARGIN_Y);
                } else {
                    // The block's own row has no bottom margin; the last child's bottom margin
                    // collapses through the children container into the block's.
                    self.pending_margin = Some(0.0);
                    self.flow(
                        &node.children,
                        x + CHILD_INDENT,
                        max_right,
                        child_depth,
                        align,
                    );
                    self.pending_margin =
                        Some(self.pending_margin.unwrap_or(0.0).max(body.margin_bottom));
                }
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
                style.dpr = self.window.scale_factor();
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
            pdf_controls: None,
            table_cells: Vec::new(),
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
            } => {
                if let Some(EquationDraft::Inline {
                    block_id,
                    utf16_offset,
                    latex,
                }) = self.input.equation_draft
                    && block_id == &node.id
                {
                    let patched = body::patch_inline_latex_draft(text, *utf16_offset, latex);
                    return self.paragraph_body(*kind, &patched, *collapsed, width, align);
                }
                self.paragraph_body(*kind, text, *collapsed, width, align)
            }
            BlockContent::List {
                kind,
                checked,
                collapsed,
                text,
                numbered_index,
                ..
            } => {
                if let Some(EquationDraft::Inline {
                    block_id,
                    utf16_offset,
                    latex,
                }) = self.input.equation_draft
                    && block_id == &node.id
                {
                    let patched = body::patch_inline_latex_draft(text, *utf16_offset, latex);
                    return self.list_body(
                        *kind,
                        *checked,
                        *collapsed && !node.children.is_empty(),
                        &patched,
                        numbered_index.unwrap_or(1),
                        list_depth,
                        width,
                        align,
                    );
                }
                self.list_body(
                    *kind,
                    *checked,
                    *collapsed && !node.children.is_empty(),
                    text,
                    numbered_index.unwrap_or(1),
                    list_depth,
                    width,
                    align,
                )
            }
            BlockContent::Divider => self.divider_body(width),
            BlockContent::Code {
                language,
                wrap,
                text,
                caption,
            } => self.code_body(&node.id, language, *wrap, text, caption, width),
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
            BlockContent::Latex { latex } => {
                let effective = match self.input.equation_draft {
                    Some(EquationDraft::Block {
                        block_id,
                        latex: draft,
                    }) if block_id == &node.id => draft.as_str(),
                    _ => latex.as_str(),
                };
                self.latex_body(effective, width)
            }
            BlockContent::Callout {
                icon,
                text,
                background_color,
            } => self.callout_body(
                icon,
                &text.plain,
                background_color.as_deref(),
                !node.children.is_empty(),
                width,
            ),
            BlockContent::Table(table) => self.table_body(table, width),
            BlockContent::Attachment {
                name,
                size,
                mime_type,
                source_id,
                caption,
                embed,
            } => self.attachment_body(
                &node.id, name, *size, mime_type, source_id, caption, *embed, width,
            ),
            BlockContent::EmbedLinkedDoc {
                page_id, caption, ..
            } => self.embed_linked_doc_body(page_id, caption, width),
            BlockContent::EmbedSyncedDoc { page_id, caption } => {
                self.embed_synced_doc_body(page_id, caption, width)
            }
            BlockContent::SurfaceRef {
                reference,
                ref_flavour,
                caption,
            } => self.surface_ref_body(&node.id, reference, ref_flavour, caption, width),
            BlockContent::Database(db) => self.database_body(&node.id, db, width),
            _ => self.unknown_body(&node.flavour, &node.id, width),
        }
    }
}
