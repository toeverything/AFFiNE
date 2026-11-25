//! Generated design tokens, monochrome icon definitions, and bundled repository fonts.
//!
//! `tokens.rs` and `icons.rs` stay at the crate root so `extract-tokens.mjs --check`
//! and standalone `rustc --edition 2024 --test` gates keep working without changes.

#![forbid(unsafe_code)]

#[allow(dead_code, clippy::all)]
pub mod tokens {
    include!("../tokens.rs");
}

#[allow(dead_code, clippy::all)]
pub mod icons {
    include!("../icons.rs");
}

pub use icons::{IconDef, IconPath, icon_by_name};
pub use tokens::{DARK_THEME, LIGHT_THEME, Rgba, TYPOGRAPHY, ThemeMode, ThemeTokens};

/// Base UI and document font family.
pub const FONT_SANS: &str = "Inter";
/// Code and inline-code font family.
pub const FONT_CODE: &str = "IBM Plex Mono";

/// Variable Inter font face (`slnt`, `wght`).
pub const INTER_VARIABLE_TTF: &[u8] =
    include_bytes!("../fonts/inter/Inter-VariableFont_slnt,wght.ttf");
/// Regular IBM Plex Mono font face.
pub const IBM_PLEX_MONO_REGULAR_TTF: &[u8] =
    include_bytes!("../fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf");
/// Bold IBM Plex Mono font face.
pub const IBM_PLEX_MONO_BOLD_TTF: &[u8] =
    include_bytes!("../fonts/ibm-plex-mono/IBMPlexMono-Bold.ttf");
/// Italic IBM Plex Mono font face.
pub const IBM_PLEX_MONO_ITALIC_TTF: &[u8] =
    include_bytes!("../fonts/ibm-plex-mono/IBMPlexMono-Italic.ttf");
/// Bold italic IBM Plex Mono font face.
pub const IBM_PLEX_MONO_BOLD_ITALIC_TTF: &[u8] =
    include_bytes!("../fonts/ibm-plex-mono/IBMPlexMono-BoldItalic.ttf");

/// Regular Noto Sans Arabic font face for contextual Arabic shaping.
pub const NOTO_SANS_ARABIC_REGULAR_TTF: &[u8] =
    include_bytes!("../fonts/noto/NotoSansArabic-Regular.ttf");
/// Regular Noto Sans Hebrew font face for Hebrew shaping.
pub const NOTO_SANS_HEBREW_REGULAR_TTF: &[u8] =
    include_bytes!("../fonts/noto/NotoSansHebrew-Regular.ttf");

/// Returns all five bundled repository font byte slices in registration order.
pub const fn bundled_font_bytes() -> [&'static [u8]; 5] {
    [
        INTER_VARIABLE_TTF,
        IBM_PLEX_MONO_REGULAR_TTF,
        IBM_PLEX_MONO_BOLD_TTF,
        IBM_PLEX_MONO_ITALIC_TTF,
        IBM_PLEX_MONO_BOLD_ITALIC_TTF,
    ]
}

/// Returns bundled RTL script fallback fonts (Arabic and Hebrew) for native shaping.
pub const fn bundled_script_font_bytes() -> [&'static [u8]; 2] {
    [NOTO_SANS_ARABIC_REGULAR_TTF, NOTO_SANS_HEBREW_REGULAR_TTF]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_fonts_are_non_empty_ttf_blobs() {
        let fonts = bundled_font_bytes();
        assert_eq!(fonts.len(), 5);
        for bytes in fonts.into_iter().chain(bundled_script_font_bytes()) {
            assert!(bytes.len() > 1024, "font payload is unexpectedly small");
            let tag = &bytes[..4];
            assert!(
                tag == b"\x00\x01\x00\x00" || tag == b"OTTO" || tag == b"true",
                "unexpected sfnt header: {tag:?}"
            );
        }
    }

    #[test]
    fn bundled_fonts_match_fonts_lock_byte_lengths() {
        let lock = include_str!("../fonts.lock");
        let expected = [
            (
                "fonts/inter/Inter-VariableFont_slnt,wght.ttf",
                INTER_VARIABLE_TTF,
            ),
            (
                "fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf",
                IBM_PLEX_MONO_REGULAR_TTF,
            ),
            (
                "fonts/ibm-plex-mono/IBMPlexMono-Bold.ttf",
                IBM_PLEX_MONO_BOLD_TTF,
            ),
            (
                "fonts/ibm-plex-mono/IBMPlexMono-Italic.ttf",
                IBM_PLEX_MONO_ITALIC_TTF,
            ),
            (
                "fonts/ibm-plex-mono/IBMPlexMono-BoldItalic.ttf",
                IBM_PLEX_MONO_BOLD_ITALIC_TTF,
            ),
        ];
        for (path, bytes) in expected {
            let needle = format!("\"path\": \"{path}\"");
            let pos = lock
                .find(&needle)
                .unwrap_or_else(|| panic!("{path} missing from fonts.lock"));
            let after = &lock[pos + needle.len()..];
            let bytes_key = "\"bytes\": ";
            let bytes_pos = after
                .find(bytes_key)
                .unwrap_or_else(|| panic!("bytes field missing for {path}"));
            let digits: String = after[bytes_pos + bytes_key.len()..]
                .chars()
                .take_while(|ch| ch.is_ascii_digit())
                .collect();
            let lock_len: usize = digits
                .parse()
                .unwrap_or_else(|_| panic!("invalid bytes length for {path}: {digits:?}"));
            assert_eq!(
                bytes.len(),
                lock_len,
                "{path} byte length diverged from fonts.lock"
            );
            let sha_key = "\"sha256\": \"";
            let sha_pos = after
                .find(sha_key)
                .unwrap_or_else(|| panic!("sha256 field missing for {path}"));
            let expected_sha = &after[sha_pos + sha_key.len()..sha_pos + sha_key.len() + 64];
            assert_eq!(
                sha256_hex(bytes),
                expected_sha,
                "{path} sha256 diverged from fonts.lock"
            );
        }
    }

    fn sha256_hex(data: &[u8]) -> String {
        const K: [u32; 64] = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
            0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
            0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
            0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
            0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
            0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
            0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
            0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
            0xc67178f2,
        ];
        let mut h: [u32; 8] = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
            0x5be0cd19,
        ];
        let bit_len = (data.len() as u64) * 8;
        let mut msg = data.to_vec();
        msg.push(0x80);
        while (msg.len() % 64) != 56 {
            msg.push(0);
        }
        msg.extend_from_slice(&bit_len.to_be_bytes());
        for chunk in msg.chunks_exact(64) {
            let mut w = [0u32; 64];
            for (i, word) in chunk.chunks_exact(4).enumerate() {
                w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
            }
            for i in 16..64 {
                let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
                let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
                w[i] = w[i - 16]
                    .wrapping_add(s0)
                    .wrapping_add(w[i - 7])
                    .wrapping_add(s1);
            }
            let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
            for i in 0..64 {
                let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
                let ch = (e & f) ^ ((!e) & g);
                let t1 = hh
                    .wrapping_add(s1)
                    .wrapping_add(ch)
                    .wrapping_add(K[i])
                    .wrapping_add(w[i]);
                let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
                let maj = (a & b) ^ (a & c) ^ (b & c);
                let t2 = s0.wrapping_add(maj);
                hh = g;
                g = f;
                f = e;
                e = d.wrapping_add(t1);
                d = c;
                c = b;
                b = a;
                a = t1.wrapping_add(t2);
            }
            for (slot, delta) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
                *slot = slot.wrapping_add(delta);
            }
        }
        let mut out = String::with_capacity(64);
        for word in h {
            use std::fmt::Write as _;
            let _ = write!(&mut out, "{word:08x}");
        }
        out
    }

    #[test]
    fn reexports_expose_themes_and_icons() {
        assert_ne!(
            LIGHT_THEME.background_primary,
            DARK_THEME.background_primary
        );
        assert!(icon_by_name("PageIcon").is_some());
        assert!(TYPOGRAPHY.editor_width_px > 0.0);
    }
}
