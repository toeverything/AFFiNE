use std::{
    collections::{BTreeSet, HashMap},
    hash::{Hash, Hasher},
    rc::Rc,
    sync::Arc,
};

use blocksuite_playground_doc::read::{BlockContent, BlockNode, RichText, TextAlign as BlockAlign};
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
    database_authoring_hits: HashMap<String, Vec<crate::database::DatabaseAuthoringHit>>,
    database_view_tabs_max_scroll: HashMap<String, (i32, i32)>,
    pub database_state: crate::database::DatabaseFlowState,
    /// `affine:code` block ids currently toggled into visual preview mode (zero CRDT writeback).
    pub code_preview_blocks: BTreeSet<String>,
    /// Currently focused editable `affine:table` block id, if any (`None` when unfocused/readonly).
    pub focused_table_block: Option<String>,
    /// Transient four-state interaction map for external embed cards (`showOverlay` shield).
    pub embed_states: HashMap<String, EmbedCardState>,
    /// True whenever a modal/popover/drawer/panel is open above the page (`embed.no_overlay_punchthrough`).
    pub embeds_shielded: bool,
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
    pub(super) database_authoring_hits: HashMap<String, Vec<crate::database::DatabaseAuthoringHit>>,
    pub(super) database_view_tabs_max_scroll: HashMap<String, (i32, i32)>,
    pub(super) code_preview_blocks: &'a BTreeSet<String>,
    pub(super) focused_table_block: Option<&'a str>,
    pub(super) embed_states: &'a HashMap<String, EmbedCardState>,
    pub(super) embeds_shielded: bool,
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

    /// Desktop authoring hit targets recorded for `block_id` during the latest layout pass.
    pub fn database_authoring_hits(
        &self,
        block_id: &str,
    ) -> &[crate::database::DatabaseAuthoringHit] {
        self.database_authoring_hits
            .get(block_id)
            .map_or(&[], Vec::as_slice)
    }

    /// Measured `(scroll_px, max_scroll_px)` of `block_id`'s touch view-tab strip.
    pub fn database_view_tabs_metrics(&self, block_id: &str) -> (i32, i32) {
        self.database_view_tabs_max_scroll
            .get(block_id)
            .copied()
            .unwrap_or((0, 0))
    }

    /// Measured horizontal overflow (whole px, `0` when not overflowing) of `block_id`'s
    /// touch view-tab strip from the latest layout pass.
    pub fn database_view_tabs_max_scroll(&self, block_id: &str) -> i32 {
        self.database_view_tabs_metrics(block_id).1
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
            database_authoring_hits: std::mem::take(&mut self.database_authoring_hits),
            database_view_tabs_max_scroll: std::mem::take(&mut self.database_view_tabs_max_scroll),
            code_preview_blocks: &self.code_preview_blocks,
            focused_table_block: self.focused_table_block.as_deref(),
            embed_states: &self.embed_states,
            embeds_shielded: self.embeds_shielded,
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
        self.database_authoring_hits = pass.database_authoring_hits;
        self.database_view_tabs_max_scroll = pass.database_view_tabs_max_scroll;
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
            database_authoring_hits: std::mem::take(&mut self.database_authoring_hits),
            database_view_tabs_max_scroll: std::mem::take(&mut self.database_view_tabs_max_scroll),
            code_preview_blocks: &self.code_preview_blocks,
            focused_table_block: self.focused_table_block.as_deref(),
            embed_states: &self.embed_states,
            embeds_shielded: self.embeds_shielded,
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
        self.database_authoring_hits = pass.database_authoring_hits;
        self.database_view_tabs_max_scroll = pass.database_view_tabs_max_scroll;
        FlowLayout {
            blocks: pass.blocks,
            width: input.width,
            height: pass.y,
            direction,
            stats: pass.stats,
        }
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
        self.direction.is_rtl().hash(&mut hasher);
        self.input.form_factor.hash(&mut hasher);
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
                let off = i64::from(self.input.utc_offset_for(self.database_state.clock_ms));
                let day = self
                    .database_state
                    .clock_ms
                    .saturating_add(off * 60_000)
                    .div_euclid(86_400_000);
                (
                    self.database_state.state_for(&node.id),
                    self.database_state.mobile_readonly,
                    day,
                )
            });
            let code_preview_sig = match &node.content {
                BlockContent::Code { language, text, .. }
                    if self.code_preview_blocks.contains(&node.id) =>
                {
                    Some(
                        CodePreviewKind::from_language(language)
                            .map_or_else(super::preview_revision, |k| {
                                super::code_preview::code_preview_revision(k, text)
                            }),
                    )
                }
                _ => None,
            };
            let table_focused = matches!(node.content, BlockContent::Table(_))
                && self.focused_table_block == Some(node.id.as_str());
            let embed_card_state = matches!(node.content, BlockContent::ExternalEmbed { .. })
                .then(|| self.effective_embed_state(&node.id));
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
                (code_preview_sig, table_focused, embed_card_state),
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
}
