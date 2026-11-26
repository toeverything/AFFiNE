use std::{
    collections::{BTreeMap, HashMap},
    rc::Rc,
    sync::Arc,
};

use blocksuite_playground_doc::{
    read::PageSnapshot,
    schema::{ListType, ParagraphType},
};
use ui::{App, Bounds, Corners, Hsla, Pixels, Point, SharedString, Window, point, px};

use crate::{
    rich_text::{CaretPosition, LaidOutRichParagraph, WrapAffinity},
    theme::{IconPaint, PlaygroundTheme},
};

use super::*;

/// What a laid-out block is, for tests and snapshot consumers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlowKind {
    Title,
    Paragraph(ParagraphType),
    List(ListType),
    Divider,
    Code,
    Image,
    Bookmark,
    Latex,
    Callout,
    Table,
    Attachment,
    EmbedLinkedDoc,
    EmbedSyncedDoc,
    SurfaceRef,
    Unknown,
}

/// Laid-out text of a block: rich paragraph text or a plain single-style label.
#[derive(Clone)]
pub enum FlowTextLayout {
    Rich(Arc<LaidOutRichParagraph>),
    Plain(Rc<InlineLayout>),
}

impl FlowTextLayout {
    pub fn line_height(&self) -> f32 {
        match self {
            Self::Rich(layout) => f32::from(layout.line_height()),
            Self::Plain(layout) => layout.line_height,
        }
    }

    pub fn line_count(&self) -> usize {
        match self {
            Self::Rich(layout) => layout.lines().len(),
            Self::Plain(layout) => layout.line_count,
        }
    }

    pub fn height(&self) -> f32 {
        self.line_count() as f32 * self.line_height()
    }

    pub fn decorations(&self) -> &[crate::rich_text::InlineDecoration] {
        match self {
            Self::Rich(layout) => layout.inline_decorations(),
            Self::Plain(_) => &[],
        }
    }

    /// Width of the widest line.
    pub fn content_width(&self) -> f32 {
        match self {
            Self::Rich(layout) => f32::from(layout.size().width),
            Self::Plain(layout) => layout.content_width(),
        }
    }

    /// Position of a UTF-16 source offset as `(x, line)`.
    pub fn caret(&self, source_offset: usize) -> (f32, usize) {
        match self {
            Self::Rich(layout) => {
                let (line, x) = layout.caret_line_and_x(CaretPosition {
                    utf16_offset: source_offset as u64,
                    affinity: WrapAffinity::Downstream,
                });
                (f32::from(x), line)
            }
            Self::Plain(layout) => layout.caret(source_offset),
        }
    }

    /// Per-line `(line, x0, x1)` spans covering the UTF-16 source range `start..end`.
    pub fn selection_spans(&self, start: usize, end: usize) -> Vec<(usize, f32, f32)> {
        match self {
            Self::Rich(layout) => {
                let line_height = f32::from(layout.line_height());
                layout
                    .selection_rects(start as u64, end as u64)
                    .into_iter()
                    .map(|rect| {
                        let x0 = f32::from(rect.origin.x);
                        (
                            (f32::from(rect.origin.y) / line_height).round() as usize,
                            x0,
                            x0 + f32::from(rect.size.width),
                        )
                    })
                    .collect()
            }
            Self::Plain(layout) => layout.selection_spans(start, end),
        }
    }

    pub(super) fn prim(&self, x: f32, y: f32) -> Prim {
        match self {
            Self::Rich(layout) => Prim::Rich {
                x,
                y,
                layout: layout.clone(),
            },
            Self::Plain(layout) => Prim::Text {
                x,
                y,
                layout: layout.clone(),
                clip: None,
            },
        }
    }
}

/// Primary text of a block, kept for caret and selection geometry.
#[derive(Clone)]
pub struct FlowText {
    pub x: f32,
    pub y: f32,
    pub layout: FlowTextLayout,
}

/// Interactive Prev/Next hit targets of an embedded PDF attachment block, relative to the block.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AttachmentPdfControls {
    pub prev: FlowRect,
    pub next: FlowRect,
    pub page_index: usize,
    pub page_count: usize,
}

/// Interactive hit target and laid-out rich text geometry of one `affine:table` cell,
/// relative to the table block.
#[derive(Clone)]
pub struct TableCellHit {
    pub row_id: String,
    pub column_id: String,
    pub rect: FlowRect,
    pub text_origin: (f32, f32),
    pub text: FlowTextLayout,
}

impl TableCellHit {
    /// Hit-test table-block-local `(x, y)` against this cell's laid-out text.
    pub fn hit_text(&self, local_x: f32, local_y: f32, plain: &str) -> CaretPosition {
        let x = local_x - self.text_origin.0;
        let y = local_y - self.text_origin.1;
        match &self.text {
            FlowTextLayout::Rich(rich) => rich.hit_test(point(px(x), px(y))),
            FlowTextLayout::Plain(p) => {
                let line = ((y / p.line_height).floor().max(0.0) as usize)
                    .min(p.line_count.saturating_sub(1));
                let index = crate::rich_text::TextBiIndex::new(plain);
                let mut offset = 0;
                let mut best = (usize::MAX, f32::MAX, 0);
                loop {
                    let (at, row) = p.caret(offset as usize);
                    let distance = (line.abs_diff(row), (at - x).abs(), offset);
                    if distance < best {
                        best = distance;
                    }
                    if offset == index.utf16_len() {
                        break;
                    }
                    offset = index.next_grapheme_utf16(offset);
                }
                CaretPosition {
                    utf16_offset: best.2,
                    affinity: WrapAffinity::Downstream,
                }
            }
        }
    }
}

/// Position-independent layout of one block: size, margins and paint primitives.
#[derive(Clone)]
pub struct BlockBody {
    pub kind: FlowKind,
    pub width: f32,
    pub height: f32,
    pub margin_top: f32,
    pub margin_bottom: f32,
    /// Plain text recorded on the block's element snapshot.
    pub plain: String,
    pub text: Option<FlowText>,
    /// Box of the list prefix (bullet, number, checkbox or toggle), if the block has one.
    pub prefix: Option<FlowRect>,
    /// Horizontal scroll range of an unwrapped code block whose lines overflow.
    pub code_scroll: Option<CodeScroll>,
    /// Pagination buttons of an embedded PDF attachment block, if active.
    pub pdf_controls: Option<AttachmentPdfControls>,
    /// Cell hit boxes of an `affine:table` block.
    pub table_cells: Vec<TableCellHit>,
    pub(super) prims: Vec<Prim>,
}

/// The scrollable code area of an unwrapped code block, relative to the block.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CodeScroll {
    pub area: FlowRect,
    /// Largest horizontal scroll offset: the widest line minus the code area width.
    pub max_x: f32,
}

/// Per-frame paint state of one block that is not part of its laid-out body.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct BlockPaint {
    /// Disclosure chevron in flight: `0.0` collapsed (pointing right) to `1.0` expanded
    /// (pointing down). `None` paints the chevron of the block's current state.
    pub chevron: Option<f32>,
    /// Horizontal scroll of an unwrapped code block, clamped to its [`CodeScroll`].
    pub code_scroll_x: f32,
}

/// Per-frame paint state of the page, by block id.
#[derive(Clone, Debug, Default)]
pub struct PagePaint {
    pub blocks: HashMap<String, BlockPaint>,
}

impl PagePaint {
    /// The code blocks of `layout` this frame scrolls sideways.
    pub fn scrolled_code(&self, layout: &FlowLayout) -> Vec<ScrolledCode> {
        self.blocks
            .iter()
            .filter(|(_, state)| state.code_scroll_x > 0.0)
            .filter_map(|(block_id, state)| {
                ScrolledCode::of_block(layout.block(block_id)?, state.code_scroll_x)
            })
            .collect()
    }
}

/// A sideways-scrolled code block of one frame, in world space. Carets and selections are
/// laid out on its unscrolled lines; this maps them to where the lines show.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScrolledCode {
    /// The block's box.
    pub block: FlowRect,
    /// The area its lines show in.
    pub area: FlowRect,
    /// How far the lines sit left of where they were laid out.
    pub scroll_x: f32,
}

impl ScrolledCode {
    /// `block` scrolled by `scroll_x`, `None` for a block that does not scroll.
    pub fn of_block(block: &FlowBlock, scroll_x: f32) -> Option<Self> {
        let code = block.body.code_scroll?;
        let scroll_x = scroll_x.clamp(0.0, code.max_x);
        (scroll_x > 0.0).then(|| Self {
            block: block.rect(),
            area: code.area.translated(block.x, block.y),
            scroll_x,
        })
    }

    /// The scrolled block a box laid out on unscrolled lines lies in.
    pub fn containing<'a>(blocks: &'a [Self], rect: &FlowRect) -> Option<&'a Self> {
        let middle = rect.y + rect.h * 0.5;
        blocks
            .iter()
            .find(|code| middle >= code.block.y && middle < code.block.bottom())
    }

    /// A box over text as the scrolled lines show it: moved left and cut to the code
    /// area. `None` when all of it scrolled out.
    pub fn span(&self, mut rect: FlowRect) -> Option<FlowRect> {
        rect.x -= self.scroll_x;
        let (left, right) = (rect.x.max(self.area.x), rect.right().min(self.area.right()));
        (right > left).then(|| FlowRect::new(left, rect.y, right - left, rect.h))
    }

    /// A caret as the scrolled lines show it, `None` when it scrolled out.
    pub fn caret(&self, mut rect: FlowRect) -> Option<FlowRect> {
        rect.x -= self.scroll_x;
        (rect.x + rect.w.max(1.0) > self.area.x && rect.x <= self.area.right()).then_some(rect)
    }
}

/// Paint a disclosure chevron: `progress` runs from `0.0` (collapsed, pointing right) to
/// `1.0` (expanded, pointing down); in between the collapsed glyph turns.
pub fn paint_chevron(
    bounds: Bounds<Pixels>,
    progress: f32,
    color: Hsla,
    window: &mut Window,
    cx: &mut App,
) {
    if progress <= 0.0 {
        IconPaint::named("ToggleRightIcon").paint(bounds, color, window, cx);
    } else if progress >= 1.0 {
        IconPaint::named("ToggleDownIcon").paint(bounds, color, window, cx);
    } else {
        IconPaint::named("ToggleRightIcon").paint_rotated(
            bounds,
            color,
            progress * std::f32::consts::FRAC_PI_2,
            window,
            cx,
        );
    }
}

impl BlockBody {
    /// The block's own disclosure chevron, as its box relative to the block and whether it
    /// shows the collapsed state. A toggle list always has one, a heading only while it
    /// is collapsed.
    pub fn chevron(&self) -> Option<(FlowRect, bool)> {
        self.prims.iter().find_map(|prim| match prim {
            Prim::Chevron {
                rect, collapsed, ..
            } => Some((*rect, *collapsed)),
            _ => None,
        })
    }

    pub(crate) fn paint(
        &self,
        origin: Point<Pixels>,
        state: BlockPaint,
        window: &mut Window,
        cx: &mut App,
    ) {
        for prim in &self.prims {
            match prim {
                Prim::CodeLine { x, y, layout, clip } => {
                    let scroll = self
                        .code_scroll
                        .map_or(0.0, |code| state.code_scroll_x.clamp(0.0, code.max_x));
                    let text_origin = point(origin.x + px(*x - scroll), origin.y + px(*y));
                    window.with_local_paint_mask(
                        ui::ContentMask {
                            bounds: clip.bounds(origin),
                        },
                        |window| layout.paint(text_origin, window, cx),
                    );
                }
                Prim::Chevron {
                    rect,
                    collapsed,
                    color,
                } => paint_chevron(
                    rect.bounds(origin),
                    state.chevron.unwrap_or(if *collapsed { 0.0 } else { 1.0 }),
                    *color,
                    window,
                    cx,
                ),
                Prim::Quad {
                    rect,
                    fill,
                    border,
                    radius,
                    dashed,
                } => paint_quad(
                    window,
                    rect.bounds(origin),
                    *radius,
                    *fill,
                    *border,
                    *dashed,
                ),
                Prim::Text { x, y, layout, clip } => {
                    let text_origin = point(origin.x + px(*x), origin.y + px(*y));
                    match clip {
                        Some(clip) => window.with_local_paint_mask(
                            ui::ContentMask {
                                bounds: clip.bounds(origin),
                            },
                            |window| layout.paint(text_origin, window, cx),
                        ),
                        None => layout.paint(text_origin, window, cx),
                    }
                }
                Prim::Rich { x, y, layout } => layout.paint_at(
                    point(origin.x + px(*x), origin.y + px(*y)),
                    &[],
                    &[],
                    None,
                    window,
                    cx,
                ),
                Prim::Icon { rect, icon, color } => {
                    icon.paint(rect.bounds(origin), *color, window, cx);
                }
                Prim::Image { rect, image } => {
                    let bounds = rect.bounds(origin);
                    let _ = window.paint_image(
                        bounds,
                        bounds,
                        Corners::all(px(0.0)),
                        image.clone(),
                        0,
                        false,
                    );
                }
            }
        }
    }
}

/// A block placed in world space.
pub struct FlowBlock {
    pub block_id: String,
    /// Id of the block's element snapshot (`page.title_block` or `page.block.<id>`).
    pub snapshot_id: SharedString,
    pub x: f32,
    pub y: f32,
    pub body: Rc<BlockBody>,
}

impl FlowBlock {
    pub fn editable(&self) -> bool {
        matches!(
            self.body.kind,
            FlowKind::Title | FlowKind::Paragraph(_) | FlowKind::List(_) | FlowKind::Code
        )
    }

    pub fn caret_rect(&self, caret: CaretPosition) -> Option<FlowRect> {
        let text = self.body.text.as_ref()?;
        let height = text.layout.line_height();
        let (x, line) = match &text.layout {
            FlowTextLayout::Rich(rich) => {
                let (line, x) = rich.caret_line_and_x(caret);
                (f32::from(x), line)
            }
            FlowTextLayout::Plain(plain) => plain.caret(caret.utf16_offset as usize),
        };
        Some(FlowRect::new(
            self.x + text.x + x,
            self.y + text.y + line as f32 * height,
            1.0,
            height,
        ))
    }

    pub fn hit_text(&self, x: f32, y: f32) -> Option<CaretPosition> {
        let text = self.body.text.as_ref()?;
        let x = x - self.x - text.x;
        let y = y - self.y - text.y;
        Some(match &text.layout {
            FlowTextLayout::Rich(rich) => rich.hit_test(point(px(x), px(y))),
            FlowTextLayout::Plain(plain) => {
                let line =
                    ((y / plain.line_height).floor().max(0.0) as usize).min(plain.line_count - 1);
                let index = crate::rich_text::TextBiIndex::new(&self.body.plain);
                let mut offset = 0;
                let mut best = (usize::MAX, f32::MAX, 0);
                loop {
                    let (at, row) = plain.caret(offset as usize);
                    let distance = (line.abs_diff(row), (at - x).abs(), offset);
                    if distance < best {
                        best = distance;
                    }
                    if offset == index.utf16_len() {
                        break;
                    }
                    offset = index.next_grapheme_utf16(offset);
                }
                CaretPosition {
                    utf16_offset: best.2,
                    affinity: WrapAffinity::Downstream,
                }
            }
        })
    }

    pub fn rect(&self) -> FlowRect {
        FlowRect::new(self.x, self.y, self.body.width, self.body.height)
    }
}

/// Everything the layout pass reads besides the window's text system.
pub struct FlowInput<'a> {
    pub snapshot: &'a PageSnapshot,
    /// Width of the page column, the world-space width of the flow.
    pub width: f32,
    pub theme: PlaygroundTheme,
    /// Titles of the workspace pages by id, for linked-page references.
    pub page_titles: &'a BTreeMap<String, String>,
    /// Image blobs by `sourceId`; a missing entry is still loading.
    pub images: &'a HashMap<String, ImageSlot>,
    /// Rasterized PDF attachment previews keyed by block id or `sourceId`.
    pub pdf_previews: Option<&'a HashMap<String, super::PdfPreviewPage>>,
    /// Bumped whenever `page_titles`, `images`, or `pdf_previews` change.
    pub env_rev: u64,
    /// Explicit layout direction supplied by the host shell.
    pub direction: ui::Direction,
}

/// Counters of the latest [`BlockFlow::layout`] pass.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FlowStats {
    /// Blocks whose body was laid out from scratch.
    pub laid_out: usize,
    /// Blocks whose unchanged body was reused from the previous pass.
    pub reused: usize,
}

/// Result of a layout pass: blocks in document order, in world space.
pub struct FlowLayout {
    pub blocks: Vec<FlowBlock>,
    pub width: f32,
    pub height: f32,
    pub direction: ui::Direction,
    pub stats: FlowStats,
}

impl FlowLayout {
    /// Hit-test document coordinates against the editable text, including margins
    /// between blocks while dragging. Ties go to the earlier block.
    pub fn hit_document(&self, x: f32, y: f32) -> Option<(String, CaretPosition)> {
        let block = self.blocks.iter().filter(|b| b.editable()).min_by(|a, b| {
            let distance =
                |block: &FlowBlock| (block.y - y).max(y - block.rect().bottom()).max(0.0);
            distance(a).total_cmp(&distance(b))
        })?;
        Some((block.block_id.clone(), block.hit_text(x, y)?))
    }

    pub fn block(&self, block_id: &str) -> Option<&FlowBlock> {
        self.blocks.iter().find(|block| block.block_id == block_id)
    }
}
