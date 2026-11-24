//! Numbers shaped from their glyphs, without asking the platform each time.
//!
//! A table of prices or a ticker shows new numbers every frame, and each one
//! is a line the platform has never shaped: on macOS, a new CoreText line per
//! number. But a number in one font and size is its digits set side by side:
//! each digit's glyph and advance, adjusted by the kerning between each pair
//! of neighbours. [`NumberShaping`] measures those once per font and size, by
//! having the platform shape each character and each pair of characters on
//! their own, and puts numbers together from them.
//!
//! That holds only while nothing but pairs of neighbours affects the result:
//! no ligatures, no substitutions depending on a wider context. The
//! characters taken are therefore few — digits, the signs and separators
//! numbers are written with, and the letters of compact units — and a pair
//! the platform shapes as anything other than the two glyphs moved apart is
//! never put together here. What remains is checked: the first lines put
//! together in each font and size, and one in every few hundred after that,
//! are shaped by the platform as well, and a font and size where the two
//! differ is left to the platform from then on.

use crate::collections::FxHashMap;
use crate::{
    FontId, FontRun, GlyphId, LineLayout, Pixels, PlatformTextSystem, ShapedGlyph, ShapedRun,
    point, px,
};

/// The characters numbers are put together from. Letters other than the
/// units `K`, `M`, `B` and `T`, and anything a font might shape in context,
/// like `:` or `x` between digits, are left to the platform.
const CHARACTERS: &[u8] = b"0123456789.,+-%$KMBT";

/// The longest line put together here; longer lines are rarely numbers.
const MAX_LEN: usize = 64;

/// How many lines put together in a font and size are checked against the
/// platform before it is trusted, and how often it is checked after that.
pub(crate) const CHECKED_FIRST: u32 = 32;
const CHECKED_EVERY: u64 = 256;

/// How far a position may be from where the platform puts it: the platform
/// adds its advances up in double precision, so the same sums in single
/// precision drift by a few millionths of a pixel.
const TOLERANCE: f32 = 1e-3;

/// Where a character stands in [`CHARACTERS`], by its byte.
const fn slots() -> [u8; 128] {
    let mut slots = [u8::MAX; 128];
    let mut i = 0;
    while i < CHARACTERS.len() {
        slots[CHARACTERS[i] as usize] = i as u8;
        i += 1;
    }
    slots
}
const SLOTS: [u8; 128] = slots();
const COUNT: usize = CHARACTERS.len();

/// A character on its own in one font and size.
#[derive(Clone, Copy)]
struct Glyph {
    id: GlyphId,
    advance: f32,
}

/// What a font and size shapes numbers into, measured as it is needed.
struct Font {
    /// Each character's glyph, `Some(None)` where the platform does not
    /// shape it as one glyph of this font.
    glyphs: [Option<Option<Glyph>>; COUNT],
    /// The kerning between each pair, `Some(None)` where the pair is not two
    /// glyphs moved apart.
    kerning: Box<[Option<Option<f32>>; COUNT * COUNT]>,
    ascent: Pixels,
    descent: Pixels,
    is_emoji: bool,
    /// Lines put together that the platform agreed with.
    checked: u32,
    /// Lines put together.
    lines: u64,
    /// Whether the platform disagreed with a line put together, which leaves
    /// this font and size to it from then on.
    disagreed: bool,
}

impl Font {
    fn new() -> Self {
        Font {
            glyphs: [None; COUNT],
            kerning: Box::new([None; COUNT * COUNT]),
            ascent: px(0.),
            descent: px(0.),
            is_emoji: false,
            checked: 0,
            lines: 0,
            disagreed: false,
        }
    }
}

/// Puts together the lines of numbers it can. See the module documentation.
#[derive(Default)]
pub(crate) struct NumberShaping {
    fonts: FxHashMap<(FontId, u32), Font>,
    /// The fonts generation the measurements were taken in. See
    /// [`crate::fast::text::fonts_changed`].
    fonts_generation: u64,
}

impl NumberShaping {
    /// `text` shaped in the one run `runs` holds, if it is a number this can
    /// put together; `None` leaves it to the platform.
    pub(crate) fn shape(
        &mut self,
        platform: &dyn PlatformTextSystem,
        text: &str,
        font_size: Pixels,
        runs: &[FontRun],
    ) -> Option<LineLayout> {
        let [run] = runs else {
            return None;
        };
        let bytes = text.as_bytes();
        if bytes.is_empty()
            || bytes.len() > MAX_LEN
            || run.len != bytes.len()
            || !bytes
                .iter()
                .all(|&byte| byte < 128 && SLOTS[byte as usize] != u8::MAX)
        {
            return None;
        }

        let fonts_generation = crate::fast::text::fonts_generation();
        if fonts_generation != self.fonts_generation {
            self.fonts.clear();
            self.fonts_generation = fonts_generation;
        }
        let font_id = run.font_id;
        let font = self
            .fonts
            .entry((font_id, font_size.0.to_bits()))
            .or_insert_with(Font::new);
        if font.disagreed {
            return None;
        }

        let layout = put_together(font, platform, bytes, font_id, font_size)?;
        font.lines += 1;
        if font.checked < CHECKED_FIRST || font.lines.is_multiple_of(CHECKED_EVERY) {
            let shaped = platform.layout_line(text, font_size, runs);
            if !agree(&layout, &shaped) {
                log::debug!(
                    "numbers in font {font_id:?} at {font_size:?} are left to the platform: \
                     it shapes {text:?} differently"
                );
                font.disagreed = true;
                return Some(shaped);
            }
            font.checked = font.checked.saturating_add(1);
        }
        Some(layout)
    }
}

/// `bytes`, every one of them in [`CHARACTERS`], put together in `font`,
/// measuring what it has not measured yet.
fn put_together(
    font: &mut Font,
    platform: &dyn PlatformTextSystem,
    bytes: &[u8],
    font_id: FontId,
    font_size: Pixels,
) -> Option<LineLayout> {
    let mut glyphs = Vec::with_capacity(bytes.len());
    let mut x = 0f32;
    let mut previous: Option<(usize, Glyph)> = None;
    for (index, &byte) in bytes.iter().enumerate() {
        let slot = SLOTS[byte as usize] as usize;
        let glyph = glyph(font, platform, slot, font_id, font_size)?;
        if let Some((previous_slot, previous_glyph)) = previous {
            let kerning = kerning(font, platform, previous_slot, slot, font_id, font_size)?;
            x += previous_glyph.advance + kerning;
        }
        glyphs.push(ShapedGlyph {
            id: glyph.id,
            position: point(px(x), px(0.)),
            index,
            is_emoji: font.is_emoji,
        });
        previous = Some((slot, glyph));
    }
    let (_, last) = previous?;
    Some(LineLayout {
        font_size,
        width: px(x + last.advance),
        ascent: font.ascent,
        descent: font.descent,
        runs: vec![ShapedRun {
            font_id,
            glyphs,
            bidi_level: 0,
        }],
        len: bytes.len(),
        base_direction: crate::BaseDirection::Ltr,
    })
}

/// The character in `slot` on its own, as the platform shapes it.
fn glyph(
    font: &mut Font,
    platform: &dyn PlatformTextSystem,
    slot: usize,
    font_id: FontId,
    font_size: Pixels,
) -> Option<Glyph> {
    if let Some(glyph) = font.glyphs[slot] {
        return glyph;
    }
    let text = &CHARACTERS[slot..slot + 1];
    let layout = platform.layout_line(
        std::str::from_utf8(text).ok()?,
        font_size,
        &[FontRun { len: 1, font_id }],
    );
    let glyph = match layout.runs.as_slice() {
        [run] if run.font_id == font_id => match run.glyphs.as_slice() {
            [shaped] if shaped.position == point(px(0.), px(0.)) && shaped.index == 0 => {
                font.ascent = layout.ascent;
                font.descent = layout.descent;
                font.is_emoji = shaped.is_emoji;
                Some(Glyph {
                    id: shaped.id,
                    advance: layout.width.0,
                })
            }
            _ => None,
        },
        _ => None,
    };
    font.glyphs[slot] = Some(glyph);
    glyph
}

/// How much closer the platform sets the characters in `left` and `right`
/// than their advances would, if the pair is just the two glyphs moved.
fn kerning(
    font: &mut Font,
    platform: &dyn PlatformTextSystem,
    left: usize,
    right: usize,
    font_id: FontId,
    font_size: Pixels,
) -> Option<f32> {
    let pair = left * COUNT + right;
    if let Some(kerning) = font.kerning[pair] {
        return kerning;
    }
    let left_glyph = glyph(font, platform, left, font_id, font_size)?;
    let right_glyph = glyph(font, platform, right, font_id, font_size)?;
    let text = [CHARACTERS[left], CHARACTERS[right]];
    let layout = platform.layout_line(
        std::str::from_utf8(&text).ok()?,
        font_size,
        &[FontRun { len: 2, font_id }],
    );
    let kerning = match layout.runs.as_slice() {
        [run] if run.font_id == font_id => match run.glyphs.as_slice() {
            [first, second]
                if first.id == left_glyph.id
                    && second.id == right_glyph.id
                    && first.index == 0
                    && second.index == 1
                    && first.position == point(px(0.), px(0.))
                    && second.position.y == px(0.) =>
            {
                let kerning = second.position.x.0 - left_glyph.advance;
                let width = second.position.x.0 + right_glyph.advance;
                ((layout.width.0 - width).abs() <= TOLERANCE).then_some(kerning)
            }
            _ => None,
        },
        _ => None,
    };
    font.kerning[pair] = Some(kerning);
    kerning
}

/// Whether a line put together is the one the platform shaped.
fn agree(ours: &LineLayout, theirs: &LineLayout) -> bool {
    let close = |a: Pixels, b: Pixels| (a.0 - b.0).abs() <= TOLERANCE;
    ours.len == theirs.len
        && ours.font_size == theirs.font_size
        && close(ours.width, theirs.width)
        && ours.ascent == theirs.ascent
        && ours.descent == theirs.descent
        && ours.runs.len() == theirs.runs.len()
        && ours.runs.iter().zip(&theirs.runs).all(|(ours, theirs)| {
            ours.font_id == theirs.font_id
                && ours.glyphs.len() == theirs.glyphs.len()
                && ours
                    .glyphs
                    .iter()
                    .zip(&theirs.glyphs)
                    .all(|(ours, theirs)| {
                        ours.id == theirs.id
                            && ours.index == theirs.index
                            && ours.is_emoji == theirs.is_emoji
                            && close(ours.position.x, theirs.position.x)
                            && close(ours.position.y, theirs.position.y)
                    })
        })
}
