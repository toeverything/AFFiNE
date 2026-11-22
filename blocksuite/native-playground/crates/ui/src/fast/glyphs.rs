//! Glyph painting that works out a run's rendering once, not once a glyph.

use crate::{
    App, AtlasTile, Bounds, ContentMask, DecorationRun, DevicePixels, FontId, GlyphId, Hsla,
    IsZero, MonochromeSprite, Pixels, Point, RenderGlyphParams, SUBPIXEL_VARIANTS_X,
    SUBPIXEL_VARIANTS_Y, ScaledPixels, Size, SubpixelSprite, TransformationMatrix, Window,
    util::round_half_toward_zero,
};
use anyhow::Result;
use std::borrow::Cow;

/// A glyph's whole-pixel origin and subpixel variant: upstream's rounding
/// for non-negative coordinates, extended so that a whole-pixel shift moves
/// the result by exactly that shift everywhere, negative coordinates included.
///
/// Upstream rounds `origin * variants` half toward zero, then takes `trunc`
/// and `fract`, which mirror around zero; a glyph painted above or left of
/// the window (a scroll layer's overscan) would then land on a different
/// pixel or variant than the same glyph painted once scrolled into view.
pub(crate) fn quantize_origin(origin: Point<ScaledPixels>) -> (Point<ScaledPixels>, Point<u8>) {
    let (x, variant_x) = quantize_axis(origin.x.0, SUBPIXEL_VARIANTS_X);
    let (y, variant_y) = quantize_axis(origin.y.0, SUBPIXEL_VARIANTS_Y);
    (
        Point::new(ScaledPixels(x), ScaledPixels(y)),
        Point::new(variant_x, variant_y),
    )
}

/// The whole pixel at or below `value` plus the nearest of `variants` steps
/// within it, ties toward the pixel; the last step carries into the next pixel.
/// On non-negative values `floor` is `trunc` and the steps round like
/// upstream's `round_half_toward_zero(value * variants)`.
fn quantize_axis(value: f32, variants: u8) -> (f32, u8) {
    let whole = value.floor();
    let steps = round_half_toward_zero((value - whole) * variants as f32) as i32;
    let carry = steps / variants as i32;
    (whole + carry as f32, (steps % variants as i32) as u8)
}

/// An emoji's whole-pixel origin: the nearest whole pixel, ties toward the
/// pixel below, which is upstream's `round_half_toward_zero` on non-negative
/// values and shifts with whole-pixel moves on negative ones.
pub(crate) fn quantize_emoji_origin(origin: Point<ScaledPixels>) -> Point<ScaledPixels> {
    origin.map(|c| {
        let whole = c.0.floor();
        ScaledPixels(whole + round_half_toward_zero(c.0 - whole))
    })
}

/// [`LineGlyphPainter::may_reach`] for a glyph on its own.

/// [`LineGlyphPainter::may_reach`] for glyphs sized alike in one mask: the
/// mask's edges pushed out by the glyphs' reach, which a line works out once
/// a run, so that each glyph only compares its origin and baseline with them.
#[derive(Clone, Copy)]
struct GlyphReach {
    size: Size<Pixels>,
    left: Pixels,
    top: Pixels,
    right: Pixels,
    bottom: Pixels,
}

impl GlyphReach {
    /// A reach [`GlyphReach::is_for`] no size, to be worked out on first use.
    const UNSET: Self = Self {
        size: Size {
            width: Pixels(f32::NAN),
            height: Pixels(f32::NAN),
        },
        left: Pixels(0.),
        top: Pixels(0.),
        right: Pixels(0.),
        bottom: Pixels(0.),
    };

    /// Whether this is the reach of glyphs of `size`, comparing bits, as a
    /// size's only use is to work out the same reach again.
    #[inline]
    fn is_for(&self, size: Size<Pixels>) -> bool {
        self.size.width.0.to_bits() == size.width.0.to_bits()
            && self.size.height.0.to_bits() == size.height.0.to_bits()
    }

    fn new(size: Size<Pixels>, mask: &Bounds<Pixels>) -> Self {
        const MARGIN: Pixels = Pixels(2.);
        // An empty mask's edges would let in the glyphs straddling it.
        if mask.is_empty() {
            return Self {
                size,
                left: Pixels(f32::INFINITY),
                top: Pixels(f32::INFINITY),
                right: Pixels(f32::NEG_INFINITY),
                bottom: Pixels(f32::NEG_INFINITY),
            };
        }
        let height = size.height + MARGIN;
        let width = size.width + MARGIN;
        let end = mask.bottom_right();
        Self {
            size,
            left: mask.origin.x - width,
            top: mask.origin.y - height,
            right: end.x + height,
            bottom: end.y + height,
        }
    }

    /// Whether a glyph whose origin is at `x` and whose baseline is at `y`
    /// may draw inside the mask.
    #[inline]
    fn contains(&self, x: Pixels, y: Pixels) -> bool {
        y > self.top && y < self.bottom && x > self.left && x < self.right
    }
}

/// How the glyphs of a run are rendered: what painting a glyph needs that
/// depends on its run, not on the glyph. See [`Window::glyph_run_rendering`].
#[derive(Clone, Copy, PartialEq)]
pub(crate) struct GlyphRunRendering {
    subpixel_rendering: bool,
    dilation: u8,
}

/// Quantize a non-unit transform scale into quarter-octave buckets so zoomed text
/// stays crisp without re-laying out paragraphs.
#[inline]
pub(crate) fn glyph_zoom_bucket(transform: &TransformationMatrix) -> Option<f32> {
    let s = transform.rotation_scale[0][0]
        .hypot(transform.rotation_scale[1][0])
        .max(1e-3);
    if (s - 1.0).abs() > 1e-3 {
        Some(
            2.0_f32
                .powf((4.0 * s.log2()).round() / 4.0)
                .clamp(0.25, 8.0),
        )
    } else {
        None
    }
}

/// [`Window::paint_glyph`], for a glyph in a run whose rendering and
/// snapped content mask the caller has already worked out.
impl Window {
    /// How the glyphs of a run in `font_id` at `font_size` and in `color` are
    /// rendered, which [`Window::paint_glyph_in_run`] takes so that painting a
    /// line works it out once a run rather than once a glyph: it asks the
    /// window how it is drawn and converts the colour to find its dilation.
    pub(crate) fn glyph_run_rendering(
        &self,
        font_id: FontId,
        font_size: Pixels,
        color: Hsla,
    ) -> GlyphRunRendering {
        GlyphRunRendering {
            subpixel_rendering: self.should_use_subpixel_rendering(font_id, font_size),
            dilation: self.text_system().glyph_dilation_for_color(color),
        }
    }

    /// [`Window::paint_glyph`], for a glyph in a run whose rendering and
    /// snapped content mask the caller has already worked out.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn paint_glyph_in_run(
        &mut self,
        origin: Point<Pixels>,
        font_id: FontId,
        glyph_id: GlyphId,
        font_size: Pixels,
        color: Hsla,
        rendering: GlyphRunRendering,
        content_mask: ContentMask<ScaledPixels>,
    ) -> Result<()> {
        self.invalidator.debug_assert_paint();

        let element_opacity = self.element_opacity();
        let scale_factor = self.scale_factor();
        let glyph_origin = origin.scale(scale_factor);
        let transformation = self.active_gpu_transformation();
        let local_content_mask = self.active_local_content_mask();
        let is_unit = transformation == TransformationMatrix::unit();
        let zoom_bucket = glyph_zoom_bucket(&transformation);

        let GlyphRunRendering {
            subpixel_rendering,
            dilation,
        } = rendering;
        let (integer_origin, subpixel_variant, raster_font_size, subpixel_rendering) =
            if let Some(bucket) = zoom_bucket {
                (
                    glyph_origin,
                    Point::default(),
                    Pixels(font_size.0 * bucket),
                    false,
                )
            } else {
                let (integer_origin, subpixel_variant) = quantize_origin(glyph_origin);
                (
                    integer_origin,
                    subpixel_variant,
                    font_size,
                    is_unit && subpixel_rendering,
                )
            };
        let params = RenderGlyphParams {
            font_id,
            glyph_id,
            font_size: raster_font_size,
            subpixel_variant,
            scale_factor,
            is_emoji: false,
            subpixel_rendering,
            dilation,
        };

        let (raster_bounds, tile, sprite_size) = match self.fast_glyph_bounds.lookup(&params) {
            Some(kept) => kept,
            None => {
                let raster_bounds = self.text_system().raster_bounds(&params)?;
                self.fast_glyph_bounds.insert(&params, raster_bounds);
                (raster_bounds, None, None)
            }
        };
        let inv_bucket = 1.0 / zoom_bucket.unwrap_or(1.0);
        let sprite_origin = Point::new(
            ScaledPixels(integer_origin.x.0 + raster_bounds.origin.x.0 as f32 * inv_bucket),
            ScaledPixels(integer_origin.y.0 + raster_bounds.origin.y.0 as f32 * inv_bucket),
        );
        if !raster_bounds.is_zero() {
            let tile = match tile {
                Some(tile) => tile,
                // The scene drops a sprite that misses its content mask;
                // where the sprite's size is known, drop it before looking up
                // its tile.
                None if sprite_size.is_some_and(|size| {
                    let local_bounds = Bounds::new(
                        sprite_origin,
                        Size::new(
                            ScaledPixels(size.width.0 as f32 * inv_bucket),
                            ScaledPixels(size.height.0 as f32 * inv_bucket),
                        ),
                    );
                    transformation
                        .map_bounds(local_bounds)
                        .intersect(&content_mask.bounds)
                        .is_empty()
                }) =>
                {
                    return Ok(());
                }
                None => {
                    let tile = self
                        .sprite_atlas
                        .get_or_insert_with(params.clone().into(), &mut || {
                            let (size, bytes) = self.text_system().rasterize_glyph(&params)?;
                            Ok(Some((size, Cow::Owned(bytes))))
                        })?
                        .expect("Callback above only errors or returns Some");
                    self.fast_glyph_bounds.insert_tile(&params, tile);
                    tile
                }
            };
            let bounds = Bounds {
                origin: sprite_origin,
                size: Size::new(
                    ScaledPixels(tile.bounds.size.width.0 as f32 * inv_bucket),
                    ScaledPixels(tile.bounds.size.height.0 as f32 * inv_bucket),
                ),
            };

            if subpixel_rendering {
                self.next_frame.scene.insert_primitive(SubpixelSprite {
                    order: 0,
                    pad: 0,
                    bounds,
                    content_mask,
                    color: color.opacity(element_opacity),
                    tile,
                    transformation,
                    local_content_mask,
                });
            } else {
                self.next_frame.scene.insert_primitive(MonochromeSprite {
                    order: 0,
                    pad: 0,
                    bounds,
                    content_mask,
                    color: color.opacity(element_opacity),
                    tile,
                    transformation,
                    local_content_mask,
                });
            }
        }
        Ok(())
    }
}

/// Paints the glyphs of a line, working out what they share once rather than
/// once a glyph: the content mask, which nothing painted along a line
/// changes, snapped for its sprites and pushed out by each run's glyph reach
/// for [`LineGlyphPainter::may_reach`], and the rendering of each run, which
/// only changes with the run's font or color.
pub(crate) struct LineGlyphPainter {
    snapped_content_mask: ContentMask<ScaledPixels>,
    content_mask: Bounds<Pixels>,
    is_transformed: bool,
    reach: GlyphReach,
    run_rendering: Option<(FontId, Hsla, GlyphRunRendering)>,
}

impl LineGlyphPainter {
    pub(crate) fn new(window: &Window) -> Self {
        Self {
            snapped_content_mask: window.snapped_content_mask(),
            content_mask: window.content_mask().bounds,
            is_transformed: window.paint_transformation() != TransformationMatrix::unit(),
            reach: GlyphReach::UNSET,
            run_rendering: None,
        }
    }

    /// Whether the line's next glyph may draw inside `mask`, the line's
    /// content mask, for the line to skip the glyphs it need not paint.
    /// `line_glyph` is the line's glyph box as upstream builds it: the
    /// glyph's origin on the top of its line, sized by the font's bounding
    /// box. The glyph itself is drawn `baseline` further down, on the line's
    /// baseline, where a tall line puts it well below the top; upstream's
    /// `line_glyph.intersects(mask)` then skips glyphs that reach into the
    /// mask.
    ///
    /// This test is only conservative, leaving the exact test to the scene,
    /// which drops a sprite outside its content mask: vertically it takes the
    /// bounding box's height above and below the baseline; horizontally, as
    /// upstream does, the bounding box's width from the glyph's origin on,
    /// and its height before it, for glyphs reaching left of their origin;
    /// each plus a margin for glyph dilation and subpixel positioning.
    /// Nothing reaches into an empty mask. Where a glyph is drawn therefore
    /// depends on its sprite alone, so a line painted in a scroll layer's
    /// overscan and scrolled into view shows the same glyphs as the line
    /// painted in place.
    #[inline]
    pub(crate) fn may_reach(
        &mut self,
        line_glyph: Bounds<Pixels>,
        baseline: Pixels,
        mask: &Bounds<Pixels>,
    ) -> bool {
        if self.is_transformed {
            return true;
        }
        debug_assert_eq!(*mask, self.content_mask);
        if !self.reach.is_for(line_glyph.size) {
            self.reach = GlyphReach::new(line_glyph.size, &self.content_mask);
        }
        self.reach
            .contains(line_glyph.origin.x, line_glyph.origin.y + baseline)
    }

    /// [`Window::paint_glyph`], for the next glyph of the line.
    pub(crate) fn paint_glyph(
        &mut self,
        window: &mut Window,
        origin: Point<Pixels>,
        font_id: FontId,
        glyph_id: GlyphId,
        font_size: Pixels,
        color: Hsla,
    ) -> Result<()> {
        let rendering = match self.run_rendering {
            Some((run_font_id, run_color, rendering))
                if run_font_id == font_id && run_color == color =>
            {
                rendering
            }
            _ => {
                let rendering = window.glyph_run_rendering(font_id, font_size, color);
                self.run_rendering = Some((font_id, color, rendering));
                rendering
            }
        };
        window.paint_glyph_in_run(
            origin,
            font_id,
            glyph_id,
            font_size,
            color,
            rendering,
            self.snapped_content_mask,
        )
    }
}

/// How many glyphs' raster bounds a window keeps at hand, as a power of two.
/// See [`GlyphBoundsCache`].
const GLYPH_BOUNDS_SLOT_BITS: u32 = 12;

/// The raster bounds of the glyphs a window painted lately, so painting a
/// glyph needn't ask the text system, which locks its map of every glyph's
/// raster bounds and hashes the glyph's whole description to look it up. A
/// glyph's raster bounds only depend on that description, so the answer is
/// the text system's own. Each glyph has one slot it can be kept in; a glyph
/// that needs a slot another holds takes it over.
///
/// A glyph's slot also keeps where the glyph is in the window's sprite atlas,
/// for the rest of the frame it was looked up in: the same digits are painted
/// in hundreds of places a frame, and each lookup locks the atlas and hashes
/// the glyph's description again. A tile is only kept for the frame, since
/// the atlas may be cleared when the frame is presented (after a run of GPU
/// errors, or when the device is lost), but glyphs are never removed from it
/// while a frame is painted.
///
/// The bounding boxes of the fonts lines were painted in lately, at the sizes
/// they were painted at, are kept here too. See [`bounding_box`].
pub(crate) struct GlyphBoundsCache {
    slots: Box<[Option<GlyphSlot>]>,
    /// Counts the frames the window finished painting, telling a tile looked
    /// up in this one from one looked up before.
    frame: u64,
    bounding_boxes: Vec<(FontId, Pixels, Bounds<Pixels>)>,
}

/// What [`GlyphBoundsCache`] keeps of a glyph.
#[derive(Clone)]
struct GlyphSlot {
    params: RenderGlyphParams,
    raster_bounds: Bounds<DevicePixels>,
    /// The glyph's tile, and the frame it was looked up in; kept past that
    /// frame for its size.
    tile: Option<(u64, AtlasTile)>,
}

impl Default for GlyphBoundsCache {
    fn default() -> Self {
        Self {
            slots: vec![None; 1 << GLYPH_BOUNDS_SLOT_BITS].into_boxed_slice(),
            frame: 0,
            bounding_boxes: Vec::new(),
        }
    }
}

impl GlyphBoundsCache {
    /// The slot a glyph is kept in, from everything that tells apart the
    /// glyphs a window paints: the same digit in two sizes, or in two colors
    /// dilated differently, or at another subpixel offset, would otherwise
    /// keep taking each other's slot.
    fn slot(params: &RenderGlyphParams) -> usize {
        const K: u64 = 0x9e37_79b9_7f4a_7c15;
        let words = [
            params.glyph_id.0 as u64 | (params.font_id.0 as u64) << 32,
            params.font_size.0.to_bits() as u64
                | (params.subpixel_variant.x as u64) << 32
                | (params.subpixel_variant.y as u64) << 40
                | (params.dilation as u64) << 48
                | (params.subpixel_rendering as u64) << 56
                | (params.is_emoji as u64) << 57,
            params.scale_factor.to_bits() as u64,
        ];
        let hash = words.iter().fold(0u64, |hash, word| {
            (hash.rotate_left(26) ^ word).wrapping_mul(K)
        });
        (hash >> (64 - GLYPH_BOUNDS_SLOT_BITS)) as usize
    }

    /// The glyph's raster bounds, if kept.

    /// The glyph's raster bounds, if kept, its tile, if it was looked up this
    /// frame, and the size of its sprite, if its tile was ever looked up: a
    /// glyph's rasterization, and so its tile's size, only depends on its
    /// description, whether or not the atlas still holds it.
    pub(crate) fn lookup(
        &self,
        params: &RenderGlyphParams,
    ) -> Option<(
        Bounds<DevicePixels>,
        Option<AtlasTile>,
        Option<Size<DevicePixels>>,
    )> {
        match &self.slots[Self::slot(params)] {
            Some(slot) if slot.params == *params => Some((
                slot.raster_bounds,
                slot.tile
                    .and_then(|(frame, tile)| (frame == self.frame).then_some(tile)),
                slot.tile.map(|(_, tile)| tile.bounds.size),
            )),
            _ => None,
        }
    }

    pub(crate) fn insert(&mut self, params: &RenderGlyphParams, bounds: Bounds<DevicePixels>) {
        self.slots[Self::slot(params)] = Some(GlyphSlot {
            params: params.clone(),
            raster_bounds: bounds,
            tile: None,
        });
    }

    /// Keeps the tile the glyph was found at in the sprite atlas this frame,
    /// if the glyph is kept.
    pub(crate) fn insert_tile(&mut self, params: &RenderGlyphParams, tile: AtlasTile) {
        if let Some(slot) = &mut self.slots[Self::slot(params)]
            && slot.params == *params
        {
            slot.tile = Some((self.frame, tile));
        }
    }

    /// Ends the frame the tiles kept were looked up in.
    pub(crate) fn finish_frame(&mut self) {
        self.frame += 1;
    }
}

/// How many fonts' bounding boxes [`bounding_box`] keeps, most recent last.
const BOUNDING_BOXES: usize = 16;

/// [`TextSystem::bounding_box`](crate::TextSystem::bounding_box), which
/// painting a line asks for once a run: it takes a lock and hashes the font to
/// find its metrics, where a window paints its text in a handful of fonts and
/// sizes, whose bounding boxes it keeps.
#[inline]
pub(crate) fn bounding_box(
    window: &mut Window,
    cx: &App,
    font_id: FontId,
    font_size: Pixels,
) -> Bounds<Pixels> {
    let boxes = &mut window.fast_glyph_bounds.bounding_boxes;
    if let Some((_, _, bounds)) = boxes
        .iter()
        .rev()
        .find(|(id, size, _)| *id == font_id && *size == font_size)
    {
        return *bounds;
    }
    let bounds = cx.text_system().bounding_box(font_id, font_size);
    if boxes.len() == BOUNDING_BOXES {
        boxes.remove(0);
    }
    boxes.push((font_id, font_size, bounds));
    bounds
}

/// Whether none of a line's decoration runs has a background, so painting its
/// background paints nothing: it needn't walk its glyphs, nor push a layer to
/// paint nothing in, which costs the scene a bounds tree insertion a line.
#[inline]
pub(crate) fn has_no_background(decoration_runs: &[DecorationRun]) -> bool {
    decoration_runs
        .iter()
        .all(|run| run.background_color.is_none())
}
