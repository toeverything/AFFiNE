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

use std::ops::Range;

const HIGH_SURROGATES: std::ops::RangeInclusive<u16> = 0xd800..=0xdbff;
const LOW_SURROGATES: std::ops::RangeInclusive<u16> = 0xdc00..=0xdfff;

/// Shortens `prefix_length` and `suffix_length` so neither ends inside a surrogate pair.
///
/// The prefix ends at `new[prefix_length - 1]`; if that unit is a high surrogate,
/// its low surrogate is the first unit of the edit, so stepping back one unit
/// includes the whole character. The suffix begins at `new[new.len() - suffix_length]`;
/// if that unit is a low surrogate, its high surrogate is the last unit of the edit,
/// so stepping forward one unit includes the whole character.
#[cfg_attr(not(target_family = "wasm"), allow(dead_code))]
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

fn match_span(old_u: &[u16], new_u: &[u16], cs: usize, ce: usize) -> Option<Range<usize>> {
    let (pre, suf) = whole_code_points(new_u, cs, new_u.len().checked_sub(ce)?);
    (pre + suf <= old_u.len()
        && old_u[..pre] == new_u[..pre]
        && old_u[old_u.len() - suf..] == new_u[new_u.len() - suf..])
        .then(|| pre..old_u.len() - suf)
}

/// Computes the app-coordinate UTF-16 range replaced when starting a composition
/// (e.g. Gboard recomposing an existing word via `setComposingRegion`), or `None`
/// when composing at the handler's current selection.
#[cfg_attr(not(target_family = "wasm"), allow(dead_code))]
pub(crate) fn composition_replacement_range(
    (stored_text, stored_sel): (&str, (u32, u32)),
    (live_text, live_sel): (&str, (u32, u32)),
    start_data: &str,
    data: &str,
    app_sel: Range<usize>,
) -> Option<Range<usize>> {
    let align = app_sel.start.checked_sub(stored_sel.0 as usize)?;
    if app_sel.end.checked_sub(stored_sel.1 as usize) != Some(align) {
        return None;
    }
    let old_u: Vec<u16> = stored_text.encode_utf16().collect();
    let r = if live_text != stored_text {
        let new_u: Vec<u16> = live_text.encode_utf16().collect();
        let data_u: Vec<u16> = data.encode_utf16().collect();
        let live_end = (live_sel.1 as usize).min(new_u.len());
        if let Some(cs) = live_end.checked_sub(data_u.len())
            && new_u[cs..live_end] == data_u[..]
        {
            match_span(&old_u, &new_u, cs, live_end)
        } else if !data_u.is_empty() && data_u.len() <= new_u.len() {
            let lo = (live_sel.0 as usize).min(new_u.len());
            let (s_min, s_max) = (
                live_end.saturating_sub(data_u.len()),
                lo.min(new_u.len() - data_u.len()),
            );
            (s_min..=s_max).rev().find_map(|cs| {
                let ce = cs + data_u.len();
                (new_u[cs..ce] == data_u[..])
                    .then(|| match_span(&old_u, &new_u, cs, ce))
                    .flatten()
            })
        } else {
            None
        }
    } else if stored_sel.0 < stored_sel.1 {
        None
    } else if live_sel != stored_sel {
        Some(live_sel.0 as usize..live_sel.1 as usize)
    } else if !start_data.is_empty() {
        let sd: Vec<u16> = start_data.encode_utf16().collect();
        let end = stored_sel.0 as usize;
        end.checked_sub(sd.len())
            .filter(|&s| end <= old_u.len() && old_u[s..end] == sd[..])
            .map(|s| s..end)
    } else {
        None
    }?;
    Some(align + r.start..align + r.end)
}

#[cfg(test)]
mod tests {
    use super::composition_replacement_range as r;

    #[test]
    fn recomposition_replacement_range_cases() {
        let c = |a: (&str, u32, u32), b: (&str, u32, u32), s, d, w| {
            let app = a.1 as usize..a.2 as usize;
            assert_eq!(r((a.0, (a.1, a.2)), (b.0, (b.1, b.2)), s, d, app), w);
        };
        c(("hello", 5, 5), ("hell", 4, 4), "", "hell", Some(0..5));
        c(("hello", 5, 5), ("hellos", 6, 6), "", "hellos", Some(0..5));
        c(("hello", 5, 5), ("hallo", 5, 5), "", "hallo", Some(0..5));
        c(("say hi ok", 6, 6), ("say h ok", 5, 5), "", "h", Some(4..6));
        c(("gogo", 2, 4), ("gogo", 2, 4), "go", "x", None);
        c(("gogo", 0, 2), ("gogo", 0, 2), "go", "x", None);
        c(("gogo", 2, 4), ("gogo", 4, 4), "go", "去", None);
        c(("gogo", 4, 4), ("gogo", 4, 4), "go", "gos", Some(2..4));
        c(("gos go", 6, 6), ("gos gos", 7, 7), "", "gos", Some(4..6));
        c(("hi", 2, 2), ("h", 1, 1), "", "longer", None);
        c(("a😀b", 3, 3), ("a😀x", 4, 4), "", "😀x", Some(1..4));
    }
}
