use crate::font_pool::FontPool;

/// Builds a deterministic test [`FontPool`] with zero system font scanning.
///
/// Registers bundled Typst text/math fonts and a synthesized CJK TrueType font
/// where each distinct CJK character has a distinct advance width and outline.
pub(crate) fn build_test_font_pool() -> FontPool {
    let mut pool = FontPool::new();
    for font_bytes in typst_assets::fonts() {
        let _ = pool.register_font_bytes(font_bytes.to_vec());
    }
    pool.register_font_bytes(build_test_cjk_ttf())
        .expect("synthesized CJK test font must parse cleanly");
    pool
}

/// Returns a deterministic synthesized CJK TrueType font where each codepoint
/// maps to a unique glyph ID with a distinct rectangular outline variant
/// (varying advance width and bounding box coordinates per glyph index).
pub(crate) fn build_test_cjk_ttf() -> Vec<u8> {
    synthesize_distinct_bmp_ttf(
        "TestCJK",
        "开始流程数据处理结束渲染用户系统发送请求返回预览核发布计划光栅底座公式占比分布图表数学文档速度距离时间最大值当时中文测试通过标签",
        true,
    )
}

/// Synthesizes a Latin-only TrueType font whose `.notdef` (glyph 0) has a visible rectangular
/// outline and `0.90 em` advance (`900 / 1000` units).
#[cfg(all(feature = "svg-text", feature = "typst"))]
pub(crate) fn build_test_latin_with_notdef_ttf() -> Vec<u8> {
    synthesize_distinct_bmp_ttf(
        "TestLatinWithNotdef",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ",
        true,
    )
}

/// Synthesizes a Latin-only TrueType font whose `.notdef` (glyph 0) has zero outline bytes
/// (`loca[0] == loca[1] == 0`), matching default `pyftsubset` subsets.
#[cfg(all(feature = "svg-text", feature = "typst"))]
pub(crate) fn build_test_latin_empty_notdef_ttf() -> Vec<u8> {
    synthesize_distinct_bmp_ttf(
        "EmptyNotdefLatin",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ",
        false,
    )
}

/// Synthesizes a compact, valid TrueType font where each unique BMP character
/// receives its own glyph ID and a per-index rectangular outline variant
/// (distinct advance width and bounding box) so different characters rasterize
/// to distinct pixel buffers without shipping a multi-megabyte font in tests.
fn synthesize_distinct_bmp_ttf(
    family_name: &str,
    chars: &str,
    include_notdef_outline: bool,
) -> Vec<u8> {
    let mut codepoints: Vec<u16> = chars
        .chars()
        .filter_map(|ch| u16::try_from(ch as u32).ok())
        .collect();
    codepoints.sort_unstable();
    codepoints.dedup();

    // Glyph 0 = .notdef, Glyphs 1..=N = distinct per-codepoint outlines.
    let num_glyphs: u16 = (codepoints.len() + 1) as u16;
    let units_per_em: u16 = 1000;

    let head = build_head_table(units_per_em);
    let hhea = build_hhea_table(num_glyphs);
    let maxp = build_maxp_table(num_glyphs);
    let os2 = build_os2_table();
    let name = build_name_table(family_name);
    let post = build_post_table();
    let hmtx = build_hmtx_table(&codepoints);
    let (glyf, loca) = build_glyf_and_loca(&codepoints, include_notdef_outline);
    let cmap = build_cmap_format4(&codepoints);

    let mut tables: Vec<([u8; 4], Vec<u8>)> = vec![
        (*b"OS/2", os2),
        (*b"cmap", cmap),
        (*b"glyf", glyf),
        (*b"head", head),
        (*b"hhea", hhea),
        (*b"hmtx", hmtx),
        (*b"loca", loca),
        (*b"maxp", maxp),
        (*b"name", name),
        (*b"post", post),
    ];
    tables.sort_by_key(|(tag, _)| *tag);

    assemble_sfnt(&tables)
}

fn glyph_advance_and_box(index: usize, cp: u16) -> (u16, i16, i16, i16, i16) {
    let variant = ((cp as usize) + index * 3) % 7;
    let advance = (820 + variant * 45) as u16;
    let x_min = (60 + (variant % 3) * 25) as i16;
    let y_min = (20 + (variant % 4) * 30) as i16;
    let x_max = (advance as i16) - 60;
    let y_max = (640 + (variant % 5) * 40) as i16;
    (advance, x_min, y_min, x_max, y_max)
}

fn build_head_table(units_per_em: u16) -> Vec<u8> {
    let mut t = Vec::with_capacity(54);
    t.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    t.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    t.extend_from_slice(&0_u32.to_be_bytes());
    t.extend_from_slice(&0x5F0F_3CF5_u32.to_be_bytes());
    t.extend_from_slice(&0x000B_u16.to_be_bytes());
    t.extend_from_slice(&units_per_em.to_be_bytes());
    t.extend_from_slice(&0_i64.to_be_bytes());
    t.extend_from_slice(&0_i64.to_be_bytes());
    t.extend_from_slice(&60_i16.to_be_bytes());
    t.extend_from_slice(&0_i16.to_be_bytes());
    t.extend_from_slice(&1040_i16.to_be_bytes());
    t.extend_from_slice(&840_i16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&8_u16.to_be_bytes());
    t.extend_from_slice(&2_i16.to_be_bytes());
    t.extend_from_slice(&1_i16.to_be_bytes());
    t.extend_from_slice(&0_i16.to_be_bytes());
    t
}

fn build_hhea_table(num_glyphs: u16) -> Vec<u8> {
    let mut t = Vec::with_capacity(36);
    t.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    t.extend_from_slice(&880_i16.to_be_bytes());
    t.extend_from_slice(&(-120_i16).to_be_bytes());
    t.extend_from_slice(&0_i16.to_be_bytes());
    t.extend_from_slice(&1100_u16.to_be_bytes());
    t.extend_from_slice(&60_i16.to_be_bytes());
    t.extend_from_slice(&60_i16.to_be_bytes());
    t.extend_from_slice(&1040_i16.to_be_bytes());
    t.extend_from_slice(&1_i16.to_be_bytes());
    t.extend_from_slice(&0_i16.to_be_bytes());
    t.extend_from_slice(&0_i16.to_be_bytes());
    t.extend_from_slice(&[0u8; 8]);
    t.extend_from_slice(&0_i16.to_be_bytes());
    t.extend_from_slice(&num_glyphs.to_be_bytes());
    t
}

fn build_maxp_table(num_glyphs: u16) -> Vec<u8> {
    let mut t = Vec::with_capacity(32);
    t.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    t.extend_from_slice(&num_glyphs.to_be_bytes());
    t.extend_from_slice(&4_u16.to_be_bytes());
    t.extend_from_slice(&1_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&1_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&0_u16.to_be_bytes());
    t
}

fn build_os2_table() -> Vec<u8> {
    let mut t = vec![0u8; 78];
    t[0..2].copy_from_slice(&1_u16.to_be_bytes());
    t[2..4].copy_from_slice(&950_i16.to_be_bytes());
    t[4..6].copy_from_slice(&400_u16.to_be_bytes());
    t[6..8].copy_from_slice(&5_u16.to_be_bytes());
    t[58..62].copy_from_slice(b"TEST");
    t[62..64].copy_from_slice(&0x0040_u16.to_be_bytes());
    t[64..66].copy_from_slice(&0x0020_u16.to_be_bytes());
    t[66..68].copy_from_slice(&0x9FFF_u16.to_be_bytes());
    t[68..70].copy_from_slice(&880_i16.to_be_bytes());
    t[70..72].copy_from_slice(&(-120_i16).to_be_bytes());
    t[74..76].copy_from_slice(&880_u16.to_be_bytes());
    t[76..78].copy_from_slice(&120_u16.to_be_bytes());
    t
}

fn build_name_table(family: &str) -> Vec<u8> {
    let records = [
        (1_u16, family.to_string()),
        (2_u16, "Regular".to_string()),
        (4_u16, format!("{family} Regular")),
        (6_u16, format!("{family}-Regular")),
    ];
    let mut string_storage = Vec::new();
    let mut entries = Vec::new();
    for (name_id, text) in &records {
        let utf16: Vec<u8> = text
            .encode_utf16()
            .flat_map(|unit| unit.to_be_bytes())
            .collect();
        let offset = string_storage.len() as u16;
        let length = utf16.len() as u16;
        string_storage.extend_from_slice(&utf16);
        entries.push((*name_id, length, offset));
    }

    let count = entries.len() as u16;
    let string_offset = 6 + count * 12;
    let mut t = Vec::new();
    t.extend_from_slice(&0_u16.to_be_bytes());
    t.extend_from_slice(&count.to_be_bytes());
    t.extend_from_slice(&string_offset.to_be_bytes());
    for (name_id, length, offset) in entries {
        t.extend_from_slice(&3_u16.to_be_bytes());
        t.extend_from_slice(&1_u16.to_be_bytes());
        t.extend_from_slice(&0x0409_u16.to_be_bytes());
        t.extend_from_slice(&name_id.to_be_bytes());
        t.extend_from_slice(&length.to_be_bytes());
        t.extend_from_slice(&offset.to_be_bytes());
    }
    t.extend_from_slice(&string_storage);
    t
}

fn build_post_table() -> Vec<u8> {
    let mut t = vec![0u8; 32];
    t[0..4].copy_from_slice(&0x0003_0000_u32.to_be_bytes());
    t
}

fn build_hmtx_table(codepoints: &[u16]) -> Vec<u8> {
    let mut t = Vec::with_capacity((codepoints.len() + 1) * 4);
    // Glyph 0 (.notdef)
    t.extend_from_slice(&900_u16.to_be_bytes());
    t.extend_from_slice(&80_i16.to_be_bytes());
    for (idx, &cp) in codepoints.iter().enumerate() {
        let (advance, x_min, _, _, _) = glyph_advance_and_box(idx, cp);
        t.extend_from_slice(&advance.to_be_bytes());
        t.extend_from_slice(&x_min.to_be_bytes());
    }
    t
}

fn encode_rect_glyph(x_min: i16, y_min: i16, x_max: i16, y_max: i16) -> Vec<u8> {
    let mut g = Vec::new();
    g.extend_from_slice(&1_i16.to_be_bytes());
    g.extend_from_slice(&x_min.to_be_bytes());
    g.extend_from_slice(&y_min.to_be_bytes());
    g.extend_from_slice(&x_max.to_be_bytes());
    g.extend_from_slice(&y_max.to_be_bytes());
    g.extend_from_slice(&3_u16.to_be_bytes());
    g.extend_from_slice(&0_u16.to_be_bytes());
    g.extend_from_slice(&[0x01, 0x01, 0x01, 0x01]);
    let w = x_max - x_min;
    let h = y_max - y_min;
    for dx in [x_min, 0, w, 0] {
        g.extend_from_slice(&dx.to_be_bytes());
    }
    for dy in [y_min, h, 0, -h] {
        g.extend_from_slice(&dy.to_be_bytes());
    }
    while g.len() % 4 != 0 {
        g.push(0);
    }
    g
}

fn build_glyf_and_loca(codepoints: &[u16], include_notdef_outline: bool) -> (Vec<u8>, Vec<u8>) {
    let mut glyf = Vec::new();
    let mut offsets = Vec::with_capacity(codepoints.len() + 2);

    // Glyph 0 (.notdef)
    offsets.push(0_u32);
    if include_notdef_outline {
        glyf.extend_from_slice(&encode_rect_glyph(80, 0, 820, 760));
    }

    // Glyphs 1..=N
    for (idx, &cp) in codepoints.iter().enumerate() {
        offsets.push(glyf.len() as u32);
        let (_, x_min, y_min, x_max, y_max) = glyph_advance_and_box(idx, cp);
        glyf.extend_from_slice(&encode_rect_glyph(x_min, y_min, x_max, y_max));
    }
    offsets.push(glyf.len() as u32);

    let mut loca = Vec::with_capacity(offsets.len() * 4);
    for off in offsets {
        loca.extend_from_slice(&off.to_be_bytes());
    }
    (glyf, loca)
}

fn build_cmap_format4(codepoints: &[u16]) -> Vec<u8> {
    let seg_count = (codepoints.len() + 1) as u16;
    let seg_count_x2 = seg_count * 2;
    let mut search_range = 2_u16;
    let mut entry_selector = 0_u16;
    while search_range * 2 <= seg_count_x2 {
        search_range *= 2;
        entry_selector += 1;
    }
    let range_shift = seg_count_x2 - search_range;

    let mut subtable = Vec::new();
    subtable.extend_from_slice(&4_u16.to_be_bytes());
    let subtable_len = 16 + seg_count_x2 * 4;
    subtable.extend_from_slice(&subtable_len.to_be_bytes());
    subtable.extend_from_slice(&0_u16.to_be_bytes());
    subtable.extend_from_slice(&seg_count_x2.to_be_bytes());
    subtable.extend_from_slice(&search_range.to_be_bytes());
    subtable.extend_from_slice(&entry_selector.to_be_bytes());
    subtable.extend_from_slice(&range_shift.to_be_bytes());

    for &cp in codepoints {
        subtable.extend_from_slice(&cp.to_be_bytes());
    }
    subtable.extend_from_slice(&0xFFFF_u16.to_be_bytes());
    subtable.extend_from_slice(&0_u16.to_be_bytes());

    for &cp in codepoints {
        subtable.extend_from_slice(&cp.to_be_bytes());
    }
    subtable.extend_from_slice(&0xFFFF_u16.to_be_bytes());

    // Map codepoint at index `i` to distinct glyph ID `(i + 1)`.
    for (idx, &cp) in codepoints.iter().enumerate() {
        let gid = (idx + 1) as u16;
        let delta = gid.wrapping_sub(cp) as i16;
        subtable.extend_from_slice(&delta.to_be_bytes());
    }
    subtable.extend_from_slice(&1_i16.to_be_bytes());

    for _ in 0..seg_count {
        subtable.extend_from_slice(&0_u16.to_be_bytes());
    }

    let mut cmap = Vec::new();
    cmap.extend_from_slice(&0_u16.to_be_bytes());
    cmap.extend_from_slice(&1_u16.to_be_bytes());
    cmap.extend_from_slice(&3_u16.to_be_bytes());
    cmap.extend_from_slice(&1_u16.to_be_bytes());
    cmap.extend_from_slice(&12_u32.to_be_bytes());
    cmap.extend_from_slice(&subtable);
    cmap
}

fn assemble_sfnt(tables: &[([u8; 4], Vec<u8>)]) -> Vec<u8> {
    let num_tables = tables.len() as u16;
    let mut search_range = 16_u16;
    let mut entry_selector = 0_u16;
    while search_range * 2 <= num_tables * 16 {
        search_range *= 2;
        entry_selector += 1;
    }
    let range_shift = num_tables * 16 - search_range;

    let mut out = Vec::new();
    out.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    out.extend_from_slice(&num_tables.to_be_bytes());
    out.extend_from_slice(&search_range.to_be_bytes());
    out.extend_from_slice(&entry_selector.to_be_bytes());
    out.extend_from_slice(&range_shift.to_be_bytes());

    let mut offset = 12 + usize::from(num_tables) * 16;
    let mut head_offset = 0usize;
    for (tag, data) in tables {
        if tag == b"head" {
            head_offset = offset;
        }
        let checksum = sfnt_checksum(data);
        out.extend_from_slice(tag);
        out.extend_from_slice(&checksum.to_be_bytes());
        out.extend_from_slice(&(offset as u32).to_be_bytes());
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        offset += (data.len() + 3) & !3;
    }

    for (_, data) in tables {
        out.extend_from_slice(data);
        while out.len() % 4 != 0 {
            out.push(0);
        }
    }

    let full_checksum = sfnt_checksum(&out);
    let adjustment = 0xB1B0_AFBA_u32.wrapping_sub(full_checksum);
    out[head_offset + 8..head_offset + 12].copy_from_slice(&adjustment.to_be_bytes());
    out
}

fn sfnt_checksum(data: &[u8]) -> u32 {
    let mut sum = 0_u32;
    let (chunks, rem) = data.as_chunks::<4>();
    for chunk in chunks {
        sum = sum.wrapping_add(u32::from_be_bytes(*chunk));
    }
    if !rem.is_empty() {
        let mut last = [0u8; 4];
        last[..rem.len()].copy_from_slice(rem);
        sum = sum.wrapping_add(u32::from_be_bytes(last));
    }
    sum
}
