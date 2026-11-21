//! Eligibility only for independent, horizontal Canvas fallback of a complete
//! extended grapheme. Callers must still check whether bundled shaping supplies
//! the requested glyph and presentation; eligibility alone does not override it.
//!
//! This is intentionally not a Unicode sequence validator or an RGI emoji database.
//! Han variation selectors are checked structurally, not against the IVD registry.
//! Emoji selectors are checked against the Emoji property, not the registered
//! variation-sequence list. Eligibility does not guarantee browser coverage.
//! Flags accept two regional indicators, not only assigned country codes. ZWJ
//! support is limited to person/profession pairs and a small explicit allowlist;
//! tags are limited to the three subdivision flags. Other sequences stay on Cosmic.

use unicode_properties::{EmojiStatus, GeneralCategory, UnicodeEmoji, UnicodeGeneralCategory};
use unicode_script::{Script, UnicodeScript};
use unicode_segmentation::UnicodeSegmentation;

/// Controls browser-font fallback when loaded fonts lack a glyph or its emoji presentation.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum CanvasFontFallback {
    /// Use only fonts loaded into GPUI.
    Disabled,
    /// Use Canvas for eligible emoji, including missing text-presentation symbols.
    #[default]
    Emoji,
    /// Also allow approximate independent rendering of eligible horizontal CJK text.
    EmojiAndCjk,
}

impl CanvasFontFallback {
    #[cfg(any(target_family = "wasm", test))]
    pub(crate) fn allows(self, is_emoji: bool) -> bool {
        match self {
            Self::Disabled => false,
            Self::Emoji => is_emoji,
            Self::EmojiAndCjk => true,
        }
    }
}

/// A supported grapheme assumed to be independently renderable.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CanvasFallback {
    /// Whether this is an emoji-capable grapheme, independent of its presentation.
    pub is_emoji: bool,
    /// Whether to request emoji presentation instead of ordinary text presentation.
    pub emoji_presentation: bool,
}

/// Returns a presentation only when `grapheme` is exactly one supported extended
/// grapheme cluster. No normalization, splitting, or font-coverage decision occurs.
pub fn classify_canvas_fallback(grapheme: &str) -> Option<CanvasFallback> {
    if grapheme.is_ascii() {
        return None;
    }
    let mut graphemes = grapheme.graphemes(true);
    if graphemes.next()? != grapheme || graphemes.next().is_some() {
        return None;
    }

    if is_cjk(grapheme) {
        Some(CanvasFallback {
            is_emoji: false,
            emoji_presentation: false,
        })
    } else {
        classify_emoji(grapheme).map(|emoji_presentation| CanvasFallback {
            is_emoji: true,
            emoji_presentation,
        })
    }
}

fn is_cjk(grapheme: &str) -> bool {
    let mut characters = grapheme.chars();
    let Some(base) = characters.next() else {
        return false;
    };
    let suffix = characters.as_str();

    // The script/category checks exclude unassigned holes; the ranges exclude
    // Han radicals, iteration marks, and other non-ideographic Han characters.
    if base.script() == Script::Han
        && base.general_category() == GeneralCategory::OtherLetter
        && matches!(base, '\u{3400}'..='\u{9fff}' | '\u{f900}'..='\u{faff}'
            | '\u{20000}'..='\u{323af}')
    {
        return suffix.is_empty()
            || matches!(
                (characters.next(), characters.next()),
                (Some('\u{fe00}'..='\u{fe02}' | '\u{e0100}'..='\u{e01ef}'), None)
            );
    }

    if matches!(base, '\u{3041}'..='\u{3096}' | '\u{30a1}'..='\u{30fa}') {
        return suffix.is_empty()
      || match suffix {
        "\u{3099}" => {
          "うかきくけこさしすせそたちつてとはひふへほウカキクケコサシスセソタチツテトハヒフヘホワヰヱヲ".contains(base)
        }
        "\u{309a}" => "はひふへほハヒフヘホ".contains(base),
        _ => false,
      };
    }

    if matches!(base, '\u{ac00}'..='\u{d7a3}') {
        return suffix.is_empty()
            || ((base as u32 - 0xac00).is_multiple_of(28)
                && is_single_modern_trailing_jamo(suffix));
    }
    if matches!(base, '\u{1100}'..='\u{1112}') {
        return matches!(characters.next(), Some('\u{1161}'..='\u{1175}'))
            && (characters.as_str().is_empty()
                || is_single_modern_trailing_jamo(characters.as_str()));
    }

    suffix.is_empty()
        && (matches!(base, '\u{3131}'..='\u{3163}')
            || "、。〈〉《》「」『』【】〔〕（）［］｛｝，．！？：；・ー々〆".contains(base))
}

fn is_single_modern_trailing_jamo(text: &str) -> bool {
    let mut characters = text.chars();
    matches!(characters.next(), Some('\u{11a8}'..='\u{11c2}')) && characters.next().is_none()
}

fn classify_emoji(grapheme: &str) -> Option<bool> {
    let mut characters = grapheme.chars();
    let base = characters.next()?;
    let suffix = characters.as_str();

    if matches!(base, '0'..='9' | '#' | '*') {
        return match suffix {
            "\u{20e3}" | "\u{fe0f}\u{20e3}" => Some(true),
            _ => None,
        };
    }
    if unicode_properties::emoji::is_regional_indicator(base) {
        return (characters
            .next()
            .is_some_and(unicode_properties::emoji::is_regional_indicator)
            && characters.next().is_none())
        .then_some(true);
    }
    if matches!(
        grapheme,
        "🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}"
            | "🏴\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}"
            | "🏴\u{e0067}\u{e0062}\u{e0077}\u{e006c}\u{e0073}\u{e007f}"
    ) {
        return Some(true);
    }
    if grapheme.contains('\u{200d}') {
        return is_supported_zwj_sequence(grapheme).then_some(true);
    }
    classify_emoji_unit(grapheme)
}

fn classify_emoji_unit(text: &str) -> Option<bool> {
    let mut characters = text.chars();
    let base = characters.next()?;
    if !base.is_emoji_char() || base.is_emoji_component() {
        return None;
    }
    let status = base.emoji_status();
    let mut emoji_presentation = matches!(
        status,
        EmojiStatus::EmojiPresentation | EmojiStatus::EmojiPresentationAndModifierBase
    );
    let mut next = characters.next();
    let explicit_text = next == Some('\u{fe0e}');
    if matches!(next, Some('\u{fe0e}' | '\u{fe0f}')) {
        emoji_presentation = !explicit_text;
        next = characters.next();
    }
    if let Some(modifier) = next {
        if explicit_text
            || !matches!(
                status,
                EmojiStatus::EmojiModifierBase | EmojiStatus::EmojiPresentationAndModifierBase
            )
            || modifier.emoji_status() != EmojiStatus::EmojiPresentationAndModifierAndEmojiComponent
        {
            return None;
        }
        emoji_presentation = true;
    }
    characters.next().is_none().then_some(emoji_presentation)
}

fn is_supported_zwj_sequence(grapheme: &str) -> bool {
    if matches!(
        grapheme,
        "👨‍👩‍👧" | "👨‍👩‍👧‍👦"
            | "👩‍👩‍👧‍👦"
            | "👨‍👨‍👧‍👦"
            | "🏳️‍🌈"
            | "🏳️‍⚧️"
            | "🏴‍☠️"
            | "❤️‍🔥"
            | "❤️‍🩹"
            | "👁️‍🗨️"
            | "🐻‍❄️"
    ) {
        return true;
    }
    let Some((person, profession)) = grapheme.split_once('\u{200d}') else {
        return false;
    };
    matches!(person.chars().next(), Some('👨' | '👩' | '🧑'))
        && classify_emoji_unit(person) == Some(true)
        && matches!(
            profession,
            "⚕️" | "⚖️"
                | "✈️"
                | "🌾"
                | "🍳"
                | "🎓"
                | "🎤"
                | "🎨"
                | "🏫"
                | "🏭"
                | "💻"
                | "💼"
                | "🔧"
                | "🔬"
                | "🚀"
                | "🚒"
        )
}
