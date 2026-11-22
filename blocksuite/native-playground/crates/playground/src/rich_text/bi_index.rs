use unicode_segmentation::UnicodeSegmentation;

#[derive(Clone, Copy, Debug)]
pub(super) struct Boundary {
    pub(super) byte: usize,
    pub(super) utf16: u64,
}

/// Character and extended-grapheme boundaries, including a sentinel at the end.
/// Interior offsets snap towards the beginning of the character or grapheme.
#[derive(Debug)]
pub struct TextBiIndex {
    chars: Vec<Boundary>,
    graphemes: Vec<Boundary>,
}

impl TextBiIndex {
    pub fn new(text: &str) -> Self {
        let mut chars = Vec::new();
        let mut graphemes = Vec::new();
        let mut utf16 = 0;
        for (start, cluster) in text.grapheme_indices(true) {
            graphemes.push(Boundary { byte: start, utf16 });
            for (offset, ch) in cluster.char_indices() {
                chars.push(Boundary {
                    byte: start + offset,
                    utf16,
                });
                utf16 += ch.len_utf16() as u64;
            }
        }
        let end = Boundary {
            byte: text.len(),
            utf16,
        };
        chars.push(end);
        graphemes.push(end);
        Self { chars, graphemes }
    }

    pub(super) fn graphemes(&self) -> &[Boundary] {
        &self.graphemes
    }

    pub fn utf16_len(&self) -> u64 {
        self.chars.last().unwrap().utf16
    }

    pub fn utf16_to_utf8_clamped(&self, offset: u64) -> usize {
        self.chars[self.chars.partition_point(|b| b.utf16 <= offset) - 1].byte
    }

    pub fn utf8_to_utf16(&self, offset: usize) -> u64 {
        self.chars[self.chars.partition_point(|b| b.byte <= offset) - 1].utf16
    }

    pub fn grapheme_count(&self) -> usize {
        self.graphemes.len() - 1
    }

    pub fn prev_grapheme_utf16(&self, offset: u64) -> u64 {
        self.graphemes[self
            .graphemes
            .partition_point(|b| b.utf16 < offset.min(self.utf16_len()))
            .saturating_sub(1)]
        .utf16
    }

    pub fn next_grapheme_utf16(&self, offset: u64) -> u64 {
        self.graphemes[self
            .graphemes
            .partition_point(|b| b.utf16 <= offset)
            .min(self.grapheme_count())]
        .utf16
    }

    pub fn snap_to_grapheme_boundary_utf16(&self, offset: u64) -> u64 {
        self.graphemes[self.graphemes.partition_point(|b| b.utf16 <= offset) - 1].utf16
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_bi_index_clamps_characters_and_moves_by_extended_grapheme() {
        let text = "A中😀👨‍👩‍👧‍👦";
        let index = TextBiIndex::new(text);
        assert_eq!((index.utf16_len(), index.grapheme_count()), (15, 4));
        for (byte, _) in text
            .char_indices()
            .chain(std::iter::once((text.len(), ' ')))
        {
            let expected = text[..byte].encode_utf16().count() as u64;
            assert_eq!(index.utf8_to_utf16(byte), expected);
            assert_eq!(index.utf16_to_utf8_clamped(expected), byte);
        }
        assert_eq!(index.utf16_to_utf8_clamped(3), "A中".len());
        assert_eq!(index.utf8_to_utf16(5), 2);
        assert_eq!(index.utf16_to_utf8_clamped(u64::MAX), text.len());
        assert_eq!(index.utf8_to_utf16(usize::MAX), 15);
        assert_eq!(index.prev_grapheme_utf16(15), 4);
        assert_eq!(index.next_grapheme_utf16(4), 15);
        for inside in 5..15 {
            assert_eq!(index.prev_grapheme_utf16(inside), 4);
            assert_eq!(index.snap_to_grapheme_boundary_utf16(inside), 4);
            assert_eq!(index.next_grapheme_utf16(inside), 15);
        }
        let empty = TextBiIndex::new("");
        assert_eq!(
            (empty.prev_grapheme_utf16(1), empty.next_grapheme_utf16(0)),
            (0, 0)
        );
    }
}
