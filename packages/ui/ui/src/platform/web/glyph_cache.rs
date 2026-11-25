use crate::{Font, FontId, FontStyle, FontWeight, GlyphId, Pixels, SharedString};
use anyhow::{Result, ensure};
use std::collections::HashMap;

pub(crate) const CANVAS_FONT_BIT: usize = 1 << (usize::BITS - 1);
pub(crate) const LOGICAL_FONT_BIT: usize = 1 << (usize::BITS - 2);

#[derive(Default)]
pub(crate) struct LogicalFontTable {
    entries: Vec<(FontId, Font)>,
    by_key: HashMap<(FontId, u16, FontStyle), FontId>,
}

impl LogicalFontTable {
    pub(crate) fn intern(
        &mut self,
        native_id: FontId,
        font: &Font,
        style: FontStyle,
    ) -> Result<FontId> {
        let weight = font.weight.0.round().clamp(1.0, 1000.0) as u16;
        if let Some(id) = self.by_key.get(&(native_id, weight, style)) {
            return Ok(*id);
        }
        ensure!(
            self.entries.len() < LOGICAL_FONT_BIT,
            "logical font IDs full"
        );
        let mut descriptor = font.clone();
        descriptor.weight = FontWeight(f32::from(weight));
        descriptor.style = style;
        let id = FontId(LOGICAL_FONT_BIT | self.entries.len());
        self.entries.push((native_id, descriptor));
        self.by_key.insert((native_id, weight, style), id);
        Ok(id)
    }

    pub(crate) fn get(&self, font_id: FontId) -> Option<&(FontId, Font)> {
        if font_id.0 & LOGICAL_FONT_BIT == 0 || font_id.0 & CANVAS_FONT_BIT != 0 {
            return None;
        }
        self.entries.get(font_id.0 & !LOGICAL_FONT_BIT)
    }
}

pub(crate) fn format_css_font(
    desc: &Font,
    monospace: bool,
    font_size: Pixels,
    color: bool,
) -> Result<String> {
    let px = f32::from(font_size);
    ensure!(px.is_finite() && px > 0., "invalid Canvas font size");
    let style = match desc.style {
        FontStyle::Normal => "normal",
        FontStyle::Italic => "italic",
        FontStyle::Oblique => "oblique",
    };
    let quote = |s: &str| {
        let mut out = String::with_capacity(s.len() + 2);
        out.push('"');
        for c in s.chars() {
            if matches!(c, '\\' | '"') {
                out.push('\\');
            }
            out.push(if c.is_control() { ' ' } else { c });
        }
        out.push('"');
        out
    };
    let mut families = Vec::new();
    if !color && !desc.family.starts_with('.') {
        families.push(quote(&desc.family));
    }
    if let Some(fb) = &desc.fallbacks {
        families.extend(fb.fallback_list().iter().map(|f| quote(f)));
    }
    families.push(
        if color {
            "emoji"
        } else if monospace {
            "monospace"
        } else {
            "sans-serif"
        }
        .into(),
    );
    let weight = desc.weight.0.round().clamp(1.0, 1000.0) as u16;
    Ok(format!("{style} {weight} {px}px {}", families.join(", ")))
}

#[derive(Clone)]
pub(crate) struct CanvasGlyph {
    pub(crate) font_id: FontId,
    pub(crate) text: SharedString,
    pub(crate) color: bool,
}

#[derive(Default)]
pub(crate) struct GlyphCache {
    glyphs: Vec<CanvasGlyph>,
    ids_by_font: HashMap<(FontId, bool), HashMap<SharedString, GlyphId>>,
}

impl GlyphCache {
    pub(crate) fn id_for(&self, font_id: FontId, text: &str, color: bool) -> Option<GlyphId> {
        self.ids_by_font.get(&(font_id, color))?.get(text).copied()
    }

    pub(crate) fn get_or_insert(
        &mut self,
        font_id: FontId,
        text: &str,
        color: bool,
    ) -> Result<GlyphId> {
        if let Some(glyph_id) = self.id_for(font_id, text, color) {
            return Ok(glyph_id);
        }
        let glyph_id = GlyphId(u32::try_from(self.glyphs.len())?);
        let text = SharedString::from(text.to_owned());
        self.glyphs.push(CanvasGlyph {
            font_id,
            text: text.clone(),
            color,
        });
        self.ids_by_font
            .entry((font_id, color))
            .or_default()
            .insert(text, glyph_id);
        Ok(glyph_id)
    }

    pub(crate) fn glyph(&self, font_id: FontId, glyph_id: GlyphId) -> Option<&CanvasGlyph> {
        self.glyphs
            .get(glyph_id.0 as usize)
            .filter(|g| g.font_id == font_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{font, px};

    #[test]
    fn logical_font_table_distinguishes_weights_for_single_native_face() {
        let (mut t, native) = (LogicalFontTable::default(), FontId(3));
        let (reg, mut bold) = (font("Inter"), font("Inter"));
        bold.weight = FontWeight::BOLD;
        let a = t.intern(native, &reg, FontStyle::Normal).unwrap();
        let b = t.intern(native, &bold, FontStyle::Normal).unwrap();
        assert_ne!(a, b);
        assert_eq!(a, t.intern(native, &reg, FontStyle::Normal).unwrap());
        assert_eq!((t.get(a).unwrap().0, t.get(b).unwrap().0), (native, native));
        assert_eq!(
            format_css_font(&t.get(a).unwrap().1, false, px(16.), false).unwrap(),
            "normal 400 16px \"Inter\", sans-serif"
        );
        assert_eq!(
            format_css_font(&t.get(b).unwrap().1, false, px(16.), false).unwrap(),
            "normal 700 16px \"Inter\", sans-serif"
        );
    }
}
