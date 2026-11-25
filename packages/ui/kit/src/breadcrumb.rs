//! Domain-neutral single-line `Breadcrumb` layout engine and element builder.
//!
//! Guarantees:
//! - Single row, no wrapping, and zero horizontal scrolling (avoids back-gesture conflict).
//! - Deterministic 4-tier narrow-screen collapse priority:
//!   1. Hide trailing current item.
//!   2. Collapse middle items into a focusable `…` button.
//!   3. Fold the first item into `…`.
//!   4. Ellipsize the direct parent's trailing label as a last resort.
//! - Automatic Unicode BiDi isolation (`\u{2068}` FSI .. `\u{2069}` PDI) per segment.
//! - Separators marked `mirror_in_rtl: true` and exact LTR/RTL horizontal mirror symmetry:
//!   `rtl_x + width == viewport_width - ltr_x`.
//! - Touch target height `>= 44.0` logical pixels.

use ui::{Direction, Hsla, IntoElement, ParentElement, Styled, div, px, svg};

use crate::logical::LogicalStyled;

/// Unicode First Strong Isolate (`FSI`).
pub const BIDI_FSI: char = '\u{2068}';
/// Unicode Pop Directional Isolate (`PDI`).
pub const BIDI_PDI: char = '\u{2069}';
/// Minimum logical touch target height (`44.0 pt`).
pub const MIN_TOUCH_HEIGHT: f32 = 44.0;
/// Minimum clickable width for ellipsis and direct-parent slots on 320px viewports.
pub const MIN_TOUCH_WIDTH: f32 = 44.0;

/// Wrap `text` in Unicode BiDi isolates (`FSI` .. `PDI`) to prevent mixed LTR/RTL reordering.
pub fn bidi_isolate(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 6);
    out.push(BIDI_FSI);
    out.push_str(text);
    out.push(BIDI_PDI);
    out
}

/// Semantic kind of one input breadcrumb item.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum BreadcrumbItemKind {
    Segment,
    Switcher,
    Current,
}

/// Domain-neutral breadcrumb entry fed into [`layout_breadcrumb_bar`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BreadcrumbItem {
    pub id: String,
    pub label: String,
    pub kind: BreadcrumbItemKind,
    pub clickable: bool,
}

/// Configuration for laying out a single-line breadcrumb bar.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BreadcrumbBarConfig {
    pub viewport_width: f32,
    pub inline_padding_start: f32,
    pub inline_padding_end: f32,
    pub height: f32,
    pub separator_width: f32,
    pub ellipsis_width: f32,
    pub item_padding_x: f32,
    pub char_width_px: f32,
    pub direction: Direction,
}

impl BreadcrumbBarConfig {
    pub const fn new(viewport_width: f32, direction: Direction) -> Self {
        Self {
            viewport_width,
            inline_padding_start: 12.0,
            inline_padding_end: 12.0,
            height: MIN_TOUCH_HEIGHT,
            separator_width: 14.0,
            ellipsis_width: MIN_TOUCH_WIDTH,
            item_padding_x: 8.0,
            char_width_px: 7.5,
            direction,
        }
    }

    pub const fn with_font_scale(mut self, scale: f32) -> Self {
        self.char_width_px *= scale;
        self
    }

    pub fn available_width(&self) -> f32 {
        (self.viewport_width - self.inline_padding_start - self.inline_padding_end).max(0.0)
    }
}

/// Visual slot kind produced by [`layout_breadcrumb_bar`].
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum BreadcrumbSlotKind {
    Segment,
    Switcher,
    Ellipsis,
    Current,
}

/// One laid-out visible slot in screen coordinates.
#[derive(Clone, Debug, PartialEq)]
pub struct LaidOutBreadcrumbSlot {
    pub id: String,
    pub kind: BreadcrumbSlotKind,
    /// Display text wrapped in Unicode BiDi isolates (`\u{2068}...\u{2069}`).
    pub display_text: String,
    /// Full untruncated title for accessibility announcements.
    pub full_title: String,
    pub truncated: bool,
    pub focusable: bool,
    pub is_current: bool,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// One laid-out chevron separator between adjacent visible slots.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LaidOutSeparator {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub mirror_in_rtl: bool,
}

/// Complete single-line breadcrumb bar layout.
#[derive(Clone, Debug, PartialEq)]
pub struct BreadcrumbBarLayout {
    pub slots: Vec<LaidOutBreadcrumbSlot>,
    pub separators: Vec<LaidOutSeparator>,
    /// Items hidden by narrow-screen collapse (moved out of main focus order into the `…` menu).
    pub collapsed_items: Vec<BreadcrumbItem>,
    pub content_width: f32,
    pub height: f32,
    pub direction: Direction,
}

#[derive(Clone, Debug)]
struct CandidateSlot {
    id: String,
    kind: BreadcrumbSlotKind,
    label: String,
    full_title: String,
    truncated: bool,
    focusable: bool,
    is_current: bool,
    width: f32,
}

fn estimate_label_px(label: &str, config: &BreadcrumbBarConfig) -> f32 {
    label
        .chars()
        .map(|ch| {
            let code = ch as u32;
            if code >= 0x2E80 {
                config.char_width_px * 1.8
            } else {
                config.char_width_px
            }
        })
        .sum()
}

fn slot_chrome_width(kind: BreadcrumbSlotKind, config: &BreadcrumbBarConfig) -> f32 {
    match kind {
        // Outer inline padding + pill horizontal padding (16) + gap (4) + chevron icon (12).
        BreadcrumbSlotKind::Switcher => config.item_padding_x * 2.0 + 32.0,
        BreadcrumbSlotKind::Ellipsis => config.item_padding_x * 2.0 + 16.0,
        BreadcrumbSlotKind::Segment | BreadcrumbSlotKind::Current => config.item_padding_x * 2.0,
    }
}

fn measure_slot_width(
    label: &str,
    kind: BreadcrumbSlotKind,
    config: &BreadcrumbBarConfig,
    measure_label_px: &mut impl FnMut(&str) -> f32,
) -> f32 {
    (measure_label_px(label).ceil() + slot_chrome_width(kind, config)).max(MIN_TOUCH_WIDTH)
}

fn ellipsize_label_with_measurer(
    label: &str,
    kind: BreadcrumbSlotKind,
    max_width: f32,
    config: &BreadcrumbBarConfig,
    measure_label_px: &mut impl FnMut(&str) -> f32,
) -> (String, bool) {
    let inner = (max_width - slot_chrome_width(kind, config)).max(config.char_width_px);
    if measure_label_px(label) <= inner {
        return (label.to_string(), false);
    }
    let chars: Vec<char> = label.chars().collect();
    if chars.len() <= 1 {
        return ("…".to_string(), true);
    }
    let mut keep = chars.len() - 1;
    while keep > 0 {
        let mut candidate: String = chars[..keep].iter().collect();
        candidate.push('…');
        if measure_label_px(&candidate) <= inner {
            return (candidate, true);
        }
        keep -= 1;
    }
    ("…".to_string(), true)
}

fn candidate_from_item(
    item: &BreadcrumbItem,
    config: &BreadcrumbBarConfig,
    measure_label_px: &mut impl FnMut(&str) -> f32,
) -> CandidateSlot {
    let kind = match item.kind {
        BreadcrumbItemKind::Segment => BreadcrumbSlotKind::Segment,
        BreadcrumbItemKind::Switcher => BreadcrumbSlotKind::Switcher,
        BreadcrumbItemKind::Current => BreadcrumbSlotKind::Current,
    };
    CandidateSlot {
        id: item.id.clone(),
        kind,
        label: item.label.clone(),
        full_title: item.label.clone(),
        truncated: false,
        focusable: item.clickable || item.kind != BreadcrumbItemKind::Current,
        is_current: item.kind == BreadcrumbItemKind::Current,
        width: measure_slot_width(&item.label, kind, config, measure_label_px),
    }
}

fn ellipsis_candidate(config: &BreadcrumbBarConfig) -> CandidateSlot {
    CandidateSlot {
        id: "breadcrumb.ellipsis".to_string(),
        kind: BreadcrumbSlotKind::Ellipsis,
        label: "…".to_string(),
        full_title: "Full path".to_string(),
        truncated: false,
        focusable: true,
        is_current: false,
        width: config.ellipsis_width.max(MIN_TOUCH_WIDTH),
    }
}

fn total_width(slots: &[CandidateSlot], sep_w: f32) -> f32 {
    if slots.is_empty() {
        return 0.0;
    }
    let slots_w: f32 = slots.iter().map(|s| s.width).sum();
    let seps_w = (slots.len().saturating_sub(1) as f32) * sep_w;
    slots_w + seps_w
}

/// Pure single-line breadcrumb layout folder using estimated glyph widths.
pub fn layout_breadcrumb_bar(
    items: &[BreadcrumbItem],
    config: &BreadcrumbBarConfig,
) -> BreadcrumbBarLayout {
    layout_breadcrumb_bar_with_measurer(items, config, |s| estimate_label_px(s, config))
}

/// Pure single-line breadcrumb layout folder driven by a caller-supplied text width measurer
/// (e.g., `window.text_system().layout_line(...)`), enforcing the 4-tier collapse priority,
/// Unicode BiDi isolation, `>= 44pt` touch targets, and exact LTR/RTL mirror symmetry.
pub fn layout_breadcrumb_bar_with_measurer(
    items: &[BreadcrumbItem],
    config: &BreadcrumbBarConfig,
    mut measure_label_px: impl FnMut(&str) -> f32,
) -> BreadcrumbBarLayout {
    let height = config.height.max(MIN_TOUCH_HEIGHT);
    let available = config.available_width();
    if items.is_empty() {
        return BreadcrumbBarLayout {
            slots: Vec::new(),
            separators: Vec::new(),
            collapsed_items: Vec::new(),
            content_width: 0.0,
            height,
            direction: config.direction,
        };
    }

    let mut collapsed_items: Vec<BreadcrumbItem> = Vec::new();
    let full: Vec<CandidateSlot> = items
        .iter()
        .map(|item| candidate_from_item(item, config, &mut measure_label_px))
        .collect();

    let mut chosen = full;
    if total_width(&chosen, config.separator_width) > available {
        // Tier 1: hide trailing current item (body already displays the document title).
        let has_trailing_current = items.len() > 1
            && items
                .last()
                .is_some_and(|item| item.kind == BreadcrumbItemKind::Current);
        let ancestors: &[BreadcrumbItem] = if has_trailing_current {
            &items[..items.len() - 1]
        } else {
            items
        };

        let tier1: Vec<CandidateSlot> = ancestors
            .iter()
            .map(|item| candidate_from_item(item, config, &mut measure_label_px))
            .collect();

        if total_width(&tier1, config.separator_width) <= available {
            chosen = tier1;
        } else if ancestors.len() >= 3 {
            // Tier 2: keep first + `…` + direct parent, moving middle segments into `…`.
            let tier2 = vec![
                candidate_from_item(&ancestors[0], config, &mut measure_label_px),
                ellipsis_candidate(config),
                candidate_from_item(
                    &ancestors[ancestors.len() - 1],
                    config,
                    &mut measure_label_px,
                ),
            ];
            if total_width(&tier2, config.separator_width) <= available {
                collapsed_items.extend_from_slice(&ancestors[1..ancestors.len() - 1]);
                chosen = tier2;
            } else {
                // Tier 3: fold first segment into `…` as well -> `…` + direct parent.
                collapsed_items.extend_from_slice(&ancestors[..ancestors.len() - 1]);
                chosen = vec![
                    ellipsis_candidate(config),
                    candidate_from_item(
                        &ancestors[ancestors.len() - 1],
                        config,
                        &mut measure_label_px,
                    ),
                ];
            }
        } else if ancestors.len() == 2 {
            // Tier 3 directly when there are no middle segments: fold first into `…`.
            collapsed_items.push(ancestors[0].clone());
            chosen = vec![
                ellipsis_candidate(config),
                candidate_from_item(&ancestors[1], config, &mut measure_label_px),
            ];
        } else {
            chosen = tier1;
        }

        // Tier 4: only as last resort, ellipsize the direct parent's trailing label.
        if total_width(&chosen, config.separator_width) > available && !chosen.is_empty() {
            let prefix_len = chosen.len().saturating_sub(1);
            let other_w: f32 = chosen[..prefix_len].iter().map(|s| s.width).sum();
            let seps_w = (prefix_len as f32) * config.separator_width;
            let budget = (available - other_w - seps_w).max(MIN_TOUCH_WIDTH);
            if let Some(last) = chosen.last_mut() {
                let (ellipsized, was_truncated) = ellipsize_label_with_measurer(
                    &last.full_title,
                    last.kind,
                    budget,
                    config,
                    &mut measure_label_px,
                );
                last.label = ellipsized;
                last.truncated = was_truncated;
                last.width = budget.min(available.max(MIN_TOUCH_WIDTH));
            }
        }
    }

    // Place slots along logical inline axis so RTL is the exact mirror of LTR:
    // LTR: x = start_pad + offset
    // RTL: x = viewport_width - start_pad - offset - width
    // Thus rtl_x + width == viewport_width - ltr_x for every slot and separator.
    let mut slots = Vec::with_capacity(chosen.len());
    let mut separators = Vec::with_capacity(chosen.len().saturating_sub(1));
    let mut offset = config.inline_padding_start;

    for (idx, cand) in chosen.into_iter().enumerate() {
        if idx > 0 {
            let sep_w = config.separator_width;
            let sep_x = match config.direction {
                Direction::Ltr => offset,
                Direction::Rtl => config.viewport_width - offset - sep_w,
            };
            separators.push(LaidOutSeparator {
                x: sep_x,
                y: 0.0,
                width: sep_w,
                height,
                mirror_in_rtl: true,
            });
            offset += sep_w;
        }

        let slot_x = match config.direction {
            Direction::Ltr => offset,
            Direction::Rtl => config.viewport_width - offset - cand.width,
        };
        slots.push(LaidOutBreadcrumbSlot {
            id: cand.id,
            kind: cand.kind,
            display_text: bidi_isolate(&cand.label),
            full_title: cand.full_title,
            truncated: cand.truncated,
            focusable: cand.focusable,
            is_current: cand.is_current,
            x: slot_x,
            y: 0.0,
            width: cand.width,
            height,
        });
        offset += cand.width;
    }

    let content_width = (offset - config.inline_padding_start).max(0.0);

    BreadcrumbBarLayout {
        slots,
        separators,
        collapsed_items,
        content_width,
        height,
        direction: config.direction,
    }
}

/// Visual theme colors for rendering a [`BreadcrumbBarLayout`] into `ui` elements.
#[derive(Clone, Copy, Debug)]
pub struct BreadcrumbVisualStyle {
    pub text_color: Hsla,
    pub muted_color: Hsla,
    pub current_color: Hsla,
    pub pill_bg: Hsla,
    pub pill_border: Hsla,
}

const CHEVRON_RIGHT_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
const CHEVRON_DOWN_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;

/// Render a pre-laid-out [`BreadcrumbBarLayout`] using strictly logical inline layout helpers
/// and RTL-mirrored chevron separators.
pub fn render_breadcrumb_bar(
    layout: &BreadcrumbBarLayout,
    style: BreadcrumbVisualStyle,
) -> impl IntoElement {
    let dir = layout.direction;
    let mut row = div()
        .w_full()
        .h(px(layout.height))
        .flex()
        .flex_row()
        .items_center()
        .overflow_hidden()
        .ps(px(12.0), dir)
        .pe(px(12.0), dir);

    if dir.is_rtl() {
        row = row.dir_rtl();
    } else {
        row = row.dir_ltr();
    }

    for (idx, slot) in layout.slots.iter().enumerate() {
        if idx > 0 {
            row = row.child(
                div()
                    .w(px(14.0))
                    .h(px(layout.height))
                    .flex_shrink(0.0)
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        svg()
                            .data(CHEVRON_RIGHT_SVG)
                            .mirror_in_rtl(true)
                            .w(px(12.0))
                            .h(px(12.0))
                            .text_color(style.muted_color),
                    ),
            );
        }

        let is_pill = matches!(
            slot.kind,
            BreadcrumbSlotKind::Ellipsis | BreadcrumbSlotKind::Switcher
        );
        let text_color = if slot.is_current {
            style.current_color
        } else {
            style.text_color
        };

        let mut item_el = div()
            .w(px(slot.width))
            .h(px(layout.height))
            .min_w(px(MIN_TOUCH_WIDTH))
            .flex_shrink(0.0)
            .overflow_hidden()
            .flex()
            .items_center()
            .justify_center()
            .ps(px(4.0), dir)
            .pe(px(4.0), dir)
            .text_color(text_color)
            .text_size(px(13.0));

        if is_pill {
            let mut pill = div()
                .h(px(28.0))
                .px(px(8.0))
                .rounded(px(8.0))
                .bg(style.pill_bg)
                .border_1()
                .border_color(style.pill_border)
                .flex()
                .flex_row()
                .items_center()
                .justify_center()
                .gap(px(4.0))
                .child(slot.display_text.clone());
            if dir.is_rtl() {
                pill = pill.dir_rtl();
            } else {
                pill = pill.dir_ltr();
            }
            if slot.kind == BreadcrumbSlotKind::Switcher {
                pill = pill.child(
                    svg()
                        .data(CHEVRON_DOWN_SVG)
                        .w(px(12.0))
                        .h(px(12.0))
                        .text_color(text_color),
                );
            }
            item_el = item_el.child(pill);
        } else {
            item_el = item_el.child(slot.display_text.clone());
        }

        row = row.child(item_el);
    }

    row
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(id: &str, label: &str) -> BreadcrumbItem {
        BreadcrumbItem {
            id: id.into(),
            label: label.into(),
            kind: BreadcrumbItemKind::Segment,
            clickable: true,
        }
    }

    fn current(id: &str, label: &str) -> BreadcrumbItem {
        BreadcrumbItem {
            id: id.into(),
            label: label.into(),
            kind: BreadcrumbItemKind::Current,
            clickable: false,
        }
    }

    #[test]
    fn narrow_screen_follows_exact_four_tier_collapse_priority() {
        let items = vec![
            seg("f0", "Workspace Root"),
            seg("f1", "Product Engineering"),
            seg("f2", "Mobile Architecture"),
            seg("f3", "Direct Parent Folder"),
            current("doc", "Very Long Current Document Title"),
        ];

        // Wide viewport: keeps everything including current item.
        let wide = layout_breadcrumb_bar(&items, &BreadcrumbBarConfig::new(1200.0, Direction::Ltr));
        assert_eq!(wide.slots.len(), 5);
        assert!(wide.collapsed_items.is_empty());
        assert!(wide.slots.last().unwrap().is_current);

        // Tier 1 (900px): hides trailing current item first while keeping all 4 ancestors.
        let tier1 = layout_breadcrumb_bar(&items, &BreadcrumbBarConfig::new(900.0, Direction::Ltr));
        assert_eq!(tier1.slots.len(), 4);
        assert!(tier1.collapsed_items.is_empty());
        assert!(!tier1.slots.last().unwrap().is_current);

        // 320px with 1.3x large text: collapses to `…` + ellipsized direct parent, both >= 44pt.
        let narrow_cfg = BreadcrumbBarConfig::new(320.0, Direction::Ltr).with_font_scale(1.3);
        let narrow = layout_breadcrumb_bar(&items, &narrow_cfg);
        assert_eq!(narrow.slots.len(), 2);
        assert_eq!(narrow.slots[0].kind, BreadcrumbSlotKind::Ellipsis);
        assert_eq!(narrow.slots[1].id, "f3");
        assert!(narrow.slots[0].focusable && narrow.slots[1].focusable);
        assert!(narrow.slots[0].width >= MIN_TOUCH_WIDTH);
        assert!(narrow.slots[1].width >= MIN_TOUCH_WIDTH);
        assert!(narrow.slots[0].height >= MIN_TOUCH_HEIGHT);
        assert!(narrow.content_width <= narrow_cfg.available_width() + 0.01);
        assert_eq!(narrow.collapsed_items.len(), 3);
        assert!(narrow.slots[1].display_text.starts_with(BIDI_FSI));
        assert!(narrow.slots[1].display_text.ends_with(BIDI_PDI));
    }

    #[test]
    fn breadcrumb_ltr_and_rtl_satisfy_exact_horizontal_mirror_symmetry() {
        let items = vec![
            seg("f0", "Projects"),
            seg("f1", "Q4 Plan"),
            seg("f2", "Mobile"),
            current("doc", "Spec"),
        ];

        for viewport in [320.0_f32, 375.0, 390.0, 430.0, 844.0] {
            let ltr =
                layout_breadcrumb_bar(&items, &BreadcrumbBarConfig::new(viewport, Direction::Ltr));
            let rtl =
                layout_breadcrumb_bar(&items, &BreadcrumbBarConfig::new(viewport, Direction::Rtl));

            assert_eq!(ltr.slots.len(), rtl.slots.len());
            assert_eq!(ltr.separators.len(), rtl.separators.len());

            for (l, r) in ltr.slots.iter().zip(rtl.slots.iter()) {
                assert_eq!(l.id, r.id);
                assert!((l.width - r.width).abs() < 1e-3);
                assert!(
                    ((r.x + r.width) - (viewport - l.x)).abs() < 1e-3,
                    "slot {} mirror violation at {viewport}px: rtl_x={} w={} ltr_x={}",
                    l.id,
                    r.x,
                    r.width,
                    l.x
                );
            }

            for (l, r) in ltr.separators.iter().zip(rtl.separators.iter()) {
                assert!(l.mirror_in_rtl && r.mirror_in_rtl);
                assert!(
                    ((r.x + r.width) - (viewport - l.x)).abs() < 1e-3,
                    "separator mirror violation at {viewport}px"
                );
            }
        }
    }
}
