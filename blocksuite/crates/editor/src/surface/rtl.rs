//! Legacy BlockSuite `0.27.5` `gfx/text` `RE_RTL_CHECK` compatibility adapter.
//!
//! BlockSuite's Edgeless `gfx/text`, `gfx/shape`, and `gfx/connector` renderers determine
//! per-line / per-delta directionality with the non-`/u` ECMAScript regular expression:
//!
//! ```js
//! const RS_LTR_CHARS =
//!   'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF' +
//!   '\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF';
//! const RS_RTL_CHARS = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC';
//! const RE_RTL_CHECK = new RegExp(`^[^${RS_LTR_CHARS}]*[${RS_RTL_CHARS}]`);
//! ```
//!
//! Notably, Arabic-Indic digits (`U+0660..=U+0669`) fall inside `\u0591-\u07FF` (`RS_RTL_CHARS`),
//! so `"١A"` (`\u0661A`) evaluates to `true` (RTL) even though UAX #9 `AutoFirstStrong` would
//! classify `\u0661` as a weak `AN` number and pick `'A'` (LTR). Additionally, because the JS
//! `RegExp` omits the `/u` flag, astral supplementary characters (`> U+FFFF`) are scanned by their
//! UTF-16 high surrogate (`0xD800..=0xDBFF`), which falls inside `0x2C00..=0xFB1C` (`RS_LTR_CHARS`).

#[inline]
fn is_rs_ltr_u16(u: u16) -> bool {
    matches!(
        u,
        0x0041..=0x005A
            | 0x0061..=0x007A
            | 0x00C0..=0x00D6
            | 0x00D8..=0x00F6
            | 0x00F8..=0x02B8
            | 0x0300..=0x0590
            | 0x0800..=0x1FFF
            | 0x2C00..=0xFB1C
            | 0xFDFE..=0xFE6F
            | 0xFEFD..=0xFFFF
    )
}

#[inline]
fn is_rs_rtl_u16(u: u16) -> bool {
    matches!(u, 0x0591..=0x07FF | 0xFB1D..=0xFDFD | 0xFE70..=0xFEFC)
}

/// Exact 1:1 port of BlockSuite `0.27.5` `gfx/text` `isRTL(text)` (`RE_RTL_CHECK.test(text)`),
/// evaluated over UTF-16 code units.
pub fn is_gfx_text_rtl(text: &str) -> bool {
    for u in text.encode_utf16() {
        if is_rs_rtl_u16(u) {
            return true;
        }
        if is_rs_ltr_u16(u) {
            return false;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn re_rtl_check_matches_0275_gfx_text_edge_cases() {
        let cases = [
            ("", false),
            ("Hello world", false),
            ("12345 !@#", false),
            // Arabic-Indic digit U+0661 precedes Latin 'A': RE_RTL_CHECK returns true!
            ("\u{0661}A", true),
            ("A\u{0661}", false),
            ("123 \u{0645}\u{0631}\u{062D}\u{0628}\u{0627}", true),
            ("(\u{05E9}\u{05DC}\u{05D5}\u{05DD})", true),
            ("  - \u{FB50} test", true),
            ("\u{FE70}form", true),
            // Astral emoji high surrogate 0xD83D lies in 0x2C00..=0xFB1C (RS_LTR_CHARS) in non-/u JS RegExp.
            ("\u{1F600}\u{0645}\u{0631}\u{062D}\u{0628}\u{0627}", false),
            // CJK ideograph U+4E2D lies in 0x2C00..=0xFB1C (RS_LTR_CHARS).
            ("\u{4E2D}\u{0645}", false),
        ];
        for (input, expected) in cases {
            assert_eq!(
                is_gfx_text_rtl(input),
                expected,
                "RE_RTL_CHECK mismatch for {input:?}"
            );
        }
    }
}
