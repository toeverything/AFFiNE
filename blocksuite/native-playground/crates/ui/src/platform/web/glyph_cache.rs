use crate::{FontId, GlyphId, SharedString};
use anyhow::Result;
use std::collections::HashMap;

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
            .filter(|glyph| glyph.font_id == font_id)
    }
}
