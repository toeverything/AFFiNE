//! Integration tests for suffix-preserving `BreadcrumbItemKind::Switcher` truncation and
//! LTR/RTL mirror symmetry across narrow viewports and font scales.

use ui::Direction;
use ui_kit::{
    BIDI_FSI, BIDI_PDI, BreadcrumbBarConfig, BreadcrumbItem, BreadcrumbItemKind,
    BreadcrumbSlotKind, MIN_TOUCH_HEIGHT, MIN_TOUCH_WIDTH, layout_breadcrumb_bar,
};

fn switcher(id: &str, label: &str) -> BreadcrumbItem {
    BreadcrumbItem {
        id: id.into(),
        label: label.into(),
        kind: BreadcrumbItemKind::Switcher,
        clickable: true,
    }
}

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

fn strip_bidi(text: &str) -> &str {
    text.trim_matches(|c| c == BIDI_FSI || c == BIDI_PDI)
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

    let wide = layout_breadcrumb_bar(&items, &BreadcrumbBarConfig::new(1200.0, Direction::Ltr));
    assert_eq!(wide.slots.len(), 5);
    assert!(wide.collapsed_items.is_empty());
    assert!(wide.slots.last().unwrap().is_current);

    let tier1 = layout_breadcrumb_bar(&items, &BreadcrumbBarConfig::new(900.0, Direction::Ltr));
    assert_eq!(tier1.slots.len(), 4);
    assert!(tier1.collapsed_items.is_empty());
    assert!(!tier1.slots.last().unwrap().is_current);

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
            assert!(((r.x + r.width) - (viewport - l.x)).abs() < 1e-3);
        }

        for (l, r) in ltr.separators.iter().zip(rtl.separators.iter()) {
            assert!(l.mirror_in_rtl && r.mirror_in_rtl);
            assert!(((r.x + r.width) - (viewport - l.x)).abs() < 1e-3);
        }
    }
}

#[test]
fn switcher_preserves_count_suffix_owner_prefix_and_rtl_symmetry_across_locales() {
    let locale_cases = [
        (
            "en",
            Direction::Ltr,
            "Mobile Shell & Breadcrumb Spec · 2 places",
            "Mobile Shell & Breadcrumb Spec",
            "Offline Sync Protocol v1",
            "2 places",
        ),
        (
            "zh-Hans",
            Direction::Ltr,
            "移动外壳与面包屑规范 · 2 处",
            "移动外壳与面包屑规范",
            "离线同步协议 v1",
            "2 处",
        ),
        (
            "ar",
            Direction::Rtl,
            "مواصفات واجهة الجوال ومسار التنقل · 2 مواقع",
            "مواصفات واجهة الجوال ومسار التنقل",
            "بروتوكول المزامنة دون اتصال v1",
            "2 مواقع",
        ),
    ];

    for (locale_tag, _dir, sw_label, parent_label, cur_label, count_unit) in locale_cases {
        let two_ancestors = vec![
            switcher("ctx:multi", sw_label),
            seg("doc:arch", parent_label),
            current("doc:sync", cur_label),
        ];
        let three_ancestors = vec![
            switcher("ctx:multi", sw_label),
            seg("doc:mid", "Intermediate Trail Step"),
            seg("doc:arch", parent_label),
            current("doc:sync", cur_label),
        ];

        for (case_name, items, expected_slots) in [
            ("two_ancestors", &two_ancestors, 2usize),
            ("three_ancestors", &three_ancestors, 3usize),
        ] {
            for (viewport, scale) in [
                (280.0_f32, 1.0_f32),
                (280.0, 2.0),
                (320.0, 1.0),
                (320.0, 1.35),
                (375.0, 1.0),
                (390.0, 1.0),
            ] {
                let ltr_cfg =
                    BreadcrumbBarConfig::new(viewport, Direction::Ltr).with_font_scale(scale);
                let rtl_cfg =
                    BreadcrumbBarConfig::new(viewport, Direction::Rtl).with_font_scale(scale);
                let ltr = layout_breadcrumb_bar(items, &ltr_cfg);
                let rtl = layout_breadcrumb_bar(items, &rtl_cfg);

                assert_eq!(
                    ltr.slots.len(),
                    expected_slots,
                    "{locale_tag}/{case_name} at {viewport}px@{scale}x"
                );
                assert_eq!(
                    ltr.slots[0].kind,
                    BreadcrumbSlotKind::Switcher,
                    "{locale_tag}/{case_name} at {viewport}px@{scale}x must keep Switcher slot"
                );
                assert!(
                    ltr.content_width <= ltr_cfg.available_width() + 0.01,
                    "{locale_tag}/{case_name} at {viewport}px@{scale}x overflowed: {} > {}",
                    ltr.content_width,
                    ltr_cfg.available_width()
                );
                for slot in &ltr.slots {
                    assert!(slot.width >= MIN_TOUCH_WIDTH);
                }

                let text = strip_bidi(&ltr.slots[0].display_text);
                if (viewport - 320.0).abs() < 0.1 && (scale <= 1.36)
                    || viewport >= 375.0 && scale <= 1.01
                {
                    assert!(
                        text.contains(count_unit),
                        "{locale_tag}/{case_name} at {viewport}px@{scale}x lost count unit `{count_unit}`: `{text}`"
                    );
                    let owner_prefix = text
                        .rsplit_once(" · ")
                        .map(|(p, _)| p.trim_matches(|c: char| c.is_whitespace() || c == '…'))
                        .unwrap_or("");
                    assert!(
                        !owner_prefix.is_empty(),
                        "{locale_tag}/{case_name} at {viewport}px@{scale}x lost owner prefix: `{text}`"
                    );
                }

                assert_eq!(ltr.slots.len(), rtl.slots.len());
                for (l, r) in ltr.slots.iter().zip(rtl.slots.iter()) {
                    assert_eq!(l.kind, r.kind);
                    assert!(
                        ((r.x + r.width) - (viewport - l.x)).abs() < 1e-3,
                        "{locale_tag}/{case_name} mirror violation at {viewport}px@{scale}x for {}",
                        l.id
                    );
                }
            }
        }
    }
}
