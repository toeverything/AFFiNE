//! An application's own fonts in a font's fallback cascade.
//!
//! `Font::fallbacks` names the fonts CoreText falls back to, in order, for
//! characters the font lacks. Upstream puts each in the cascade as a
//! descriptor holding only its family name, which CoreText resolves against
//! the fonts registered with the system. The fonts an application adds with
//! `add_fonts` are never registered there: font-kit keeps them in its memory
//! source. So a fallback naming one of them resolved to nothing, and CoreText
//! drew the characters with a system font instead: an application shipping
//! Noto Sans Hebrew as the fallback of its Latin UI font got Arial Hebrew.
//!
//! The cascade now holds an application font's own descriptor, from the
//! font loaded out of the memory source, in its declared place. Fallbacks
//! naming system fonts are built as before.

use crate::collections::HashMap;
use crate::{Font, FontFallbacks, FontId};
use core_foundation::{
    array::{CFArrayAppendValue, CFMutableArrayRef},
    base::TCFType,
};
use core_text::font_descriptor::CTFontDescriptor;
use font_kit::{family_name::FamilyName, font::Font as FontKitFont, sources::mem::MemSource};
use smallvec::SmallVec;

use crate::platform::apple::text_system::FontKey;

/// The descriptors of the application's fonts among one font's fallbacks, by
/// the name the fallback list gives them.
pub(crate) struct AppFallbacks(HashMap<String, CTFontDescriptor>);

impl AppFallbacks {
    /// Loads the application's fonts that `fallbacks` names, each in the face
    /// that best matches `font`'s weight and style, as upstream's descriptors
    /// ask CoreText for the face matching the font's traits.
    pub(crate) fn new(
        memory_source: &MemSource,
        fallbacks: Option<&FontFallbacks>,
        font: &FontKitFont,
    ) -> Self {
        let mut descriptors = HashMap::default();
        let names = fallbacks.map_or(&[][..], |fallbacks| fallbacks.fallback_list());
        let mut properties = None;
        for name in names {
            if memory_source.select_family_by_name(name).is_err() {
                continue;
            }
            let properties = *properties.get_or_insert_with(|| font.properties());
            let loaded = memory_source
                .select_best_match(&[FamilyName::Title(name.clone())], &properties)
                .ok()
                .and_then(|handle| handle.load().ok());
            if let Some(loaded) = loaded {
                descriptors.insert(name.clone(), loaded.native_font().copy_descriptor());
            }
        }
        Self(descriptors)
    }

    /// Appends the descriptor of the application font named `name` to the
    /// cascade being built, returning whether `name` is one.
    pub(crate) fn append(this: &Self, fallback_array: CFMutableArrayRef, name: &str) -> bool {
        let Some(descriptor) = this.0.get(name) else {
            return false;
        };
        // SAFETY: the array retains the descriptor (it is created with
        // kCFTypeArrayCallBacks), which `this` keeps alive until then.
        unsafe { CFArrayAppendValue(fallback_array, descriptor.as_concrete_TypeRef() as _) };
        true
    }
}

/// Forgets the fonts chosen for requests with fallbacks after the
/// application adds fonts, whose cascades may name a font only now added.
/// They are loaded again with new font IDs on their next request; the old
/// IDs stay valid for lines already laid out with them.
pub(crate) fn forget_cascades(
    font_selections: &mut HashMap<Font, FontId>,
    font_ids_by_font_key: &mut HashMap<FontKey, SmallVec<[FontId; 4]>>,
) {
    font_selections.retain(|font, _| font.fallbacks.is_none());
    font_ids_by_font_key.retain(|key, _| key.font_fallbacks.is_none());
}
