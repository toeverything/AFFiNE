//! The span of an IME edit, kept to whole code points.
//!
//! The `input` listener recovers what an IME edit did by diffing the mirror's
//! UTF-16 text before and after it: the units both share at the start (the
//! prefix) and at the end (the suffix) are untouched, and what lies between
//! is the inserted text. Compared unit by unit, the two can share half of a
//! surrogate pair: replacing "😀" (U+1F600, `D83D DE00`) with "😃"
//! (U+1F603, `D83D DE03`) shares the high surrogate, so the inserted text was
//! a lone `DE03`, which `String::from_utf16_lossy` turns into U+FFFD, and the
//! document got "�" where the IME put "😃".

const HIGH_SURROGATES: std::ops::RangeInclusive<u16> = 0xd800..=0xdbff;
const LOW_SURROGATES: std::ops::RangeInclusive<u16> = 0xdc00..=0xdfff;

/// Shortens `prefix_length` and `suffix_length`, the UTF-16 units `new` shares
/// with the text before the edit at its start and its end, so that neither
/// ends inside a surrogate pair of `new`. Both are shared with the old text,
/// so neither splits a pair of the old text either.
pub(crate) fn whole_code_points(
    new: &[u16],
    mut prefix_length: usize,
    mut suffix_length: usize,
) -> (usize, usize) {
    if prefix_length > 0 && HIGH_SURROGATES.contains(&new[prefix_length - 1]) {
        prefix_length -= 1;
    }
    if suffix_length > 0 && LOW_SURROGATES.contains(&new[new.len() - suffix_length]) {
        suffix_length -= 1;
    }
    (prefix_length, suffix_length)
}
