//! Pure GroupBy evaluation for `affine:database` Table & Kanban views, aligned with
//! `0.27.5` `core/group-by/{define,trait,compare-date-keys}.ts` and `renderer/number-group.ts`.

use std::{cmp::Ordering, collections::BTreeMap};

use blocksuite_playground_doc::read::{
    DatabaseCellValue, DatabaseData, DatabaseGroupBy, DatabaseGroupProperty, DatabaseRow,
};

use crate::block_flow::civil_from_days;

use super::{days_from_civil, local_day_index, query::row_cell_text};

/// Canonical `0.27.5` key for the ungrouped bucket (`define.ts` / `groupProperties`).
pub const UNGROUPS_KEY: &str = "Ungroups";

const RELATIVE_ASC: [&str; 7] = [
    "last30",
    "last7",
    "yesterday",
    "today",
    "tomorrow",
    "next7",
    "next30",
];

/// One grouped bucket of rows (used by both Kanban lanes and grouped Table sections).
#[derive(Clone, Debug, PartialEq)]
pub struct DatabaseGroupBucket {
    pub key: String,
    pub label: String,
    pub color: Option<String>,
    pub rows: Vec<DatabaseRow>,
}

const MONTH_ABBR: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

fn month_abbr(month: u32) -> &'static str {
    MONTH_ABBR
        .get(month.saturating_sub(1) as usize)
        .copied()
        .unwrap_or("Jan")
}

/// UTC epoch milliseconds of local calendar midnight `00:00:00.000` for `day_idx`
/// (`+startOfDay(new Date(v))` in `0.27.5` `define.ts`), matching ECMA-262 `UTC(t)` across
/// midnight spring-forward DST gaps (e.g. `America/Havana` `00:00 -> 01:00`) and fall-back overlaps.
fn local_midnight_utc_ms(day_idx: i64, offset_at_ms: &dyn Fn(i64) -> i32) -> i64 {
    let t = day_idx.saturating_mul(86_400_000);
    let g0 = t.saturating_sub(i64::from(offset_at_ms(t.saturating_sub(86_400_000))) * 60_000);
    let u_before =
        t.saturating_sub(i64::from(offset_at_ms(g0.saturating_sub(21_600_000))) * 60_000);
    let u_after = t.saturating_sub(i64::from(offset_at_ms(g0.saturating_add(21_600_000))) * 60_000);
    let before_exact = u_before.saturating_add(i64::from(offset_at_ms(u_before)) * 60_000) == t;
    let after_exact = u_after.saturating_add(i64::from(offset_at_ms(u_after)) * 60_000) == t;
    match (before_exact, after_exact) {
        (true, true) => u_before.min(u_after),
        (true, false) => u_before,
        (false, true) => u_after,
        (false, false) => u_before,
    }
}

/// Exact `@emotion/hash@0.9.2` MurmurHash2 over UTF-16 low bytes formatted in base-36,
/// matching `0.27.5` `define.ts:226` `hash(v)` for string/rich-text group keys.
pub(crate) fn emotion_hash(s: &str) -> String {
    const M: u32 = 0x5bd1_e995;
    let units: Vec<u8> = s.encode_utf16().map(|u| (u & 0xff) as u8).collect();
    let mut h: u32 = 0;
    let mut chunks = units.chunks_exact(4);
    for chunk in &mut chunks {
        let mut k = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        k = k.wrapping_mul(M);
        k ^= k >> 24;
        h = k.wrapping_mul(M) ^ h.wrapping_mul(M);
    }
    let rem = chunks.remainder();
    if !rem.is_empty() {
        if rem.len() >= 3 {
            h ^= u32::from(rem[2]) << 16;
        }
        if rem.len() >= 2 {
            h ^= u32::from(rem[1]) << 8;
        }
        h ^= u32::from(rem[0]);
        h = h.wrapping_mul(M);
    }
    h ^= h >> 13;
    h = h.wrapping_mul(M);
    h ^= h >> 15;
    if h == 0 {
        return "0".to_string();
    }
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut buf = Vec::with_capacity(8);
    let mut n = h;
    while n > 0 {
        buf.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).unwrap_or_default()
}

fn compare_date_keys(mode: &str, asc: bool, a: &str, b: &str) -> Ordering {
    let sort_numeric = |x: &str, y: &str| -> Option<Ordering> {
        let nx = x.parse::<f64>().ok().filter(|n| n.is_finite())?;
        let ny = y.parse::<f64>().ok().filter(|n| n.is_finite())?;
        let ord = nx.total_cmp(&ny);
        if ord == Ordering::Equal {
            None
        } else {
            Some(if asc { ord } else { ord.reverse() })
        }
    };
    if mode == "date-relative" {
        let idx = |k: &str| -> Option<usize> {
            let pos = RELATIVE_ASC.iter().position(|&r| r == k)?;
            Some(if asc {
                pos
            } else {
                RELATIVE_ASC.len() - 1 - pos
            })
        };
        match (idx(a), idx(b)) {
            (Some(ia), Some(ib)) if ia != ib => return ia.cmp(&ib),
            (Some(_), Some(_)) => {}
            (Some(_), None) => {
                return if asc {
                    Ordering::Greater
                } else {
                    Ordering::Less
                };
            }
            (None, Some(_)) => {
                return if asc {
                    Ordering::Less
                } else {
                    Ordering::Greater
                };
            }
            (None, None) => {}
        }
        if let Some(ord) = sort_numeric(a, b) {
            return ord;
        }
        return if asc { a.cmp(b) } else { b.cmp(a) };
    }
    sort_numeric(a, b).unwrap_or_else(|| if asc { a.cmp(b) } else { b.cmp(a) })
}

fn date_group_key_and_label(
    ts_ms: i64,
    group_name: &str,
    now_ms: i64,
    offset_at_ms: &dyn Fn(i64) -> i32,
) -> (String, String) {
    let day_idx = local_day_index(ts_ms, offset_at_ms);
    let (y, m, d) = civil_from_days(day_idx);
    let month_bucket = |yr: i64, mo: u32| {
        let start_ms = local_midnight_utc_ms(days_from_civil(yr as i32, mo, 1), offset_at_ms);
        (start_ms.to_string(), format!("{} {yr}", month_abbr(mo)))
    };
    match group_name {
        "date-year" => {
            let start_ms = local_midnight_utc_ms(days_from_civil(y as i32, 1, 1), offset_at_ms);
            (start_ms.to_string(), format!("{y:04}"))
        }
        "date-day" => {
            let start_ms = local_midnight_utc_ms(day_idx, offset_at_ms);
            (start_ms.to_string(), format!("{} {d} {y}", month_abbr(m)))
        }
        "date-week-sun" | "date-week-mon" => {
            // 1970-01-01 was Thursday (4); 0 = Sun .. 6 = Sat.
            let weekday = (day_idx + 4).rem_euclid(7);
            let offset = if group_name == "date-week-mon" {
                (weekday + 6).rem_euclid(7)
            } else {
                weekday
            };
            let start_day = day_idx - offset;
            let end_day = start_day + 6;
            let (sy, sm, sd) = civil_from_days(start_day);
            let (ey, em, ed) = civil_from_days(end_day);
            let start_ms = local_midnight_utc_ms(start_day, offset_at_ms);
            (
                start_ms.to_string(),
                format!(
                    "{} {sd} {sy} \u{2013} {} {ed} {ey}",
                    month_abbr(sm),
                    month_abbr(em)
                ),
            )
        }
        "date-relative" => {
            let today_idx = local_day_index(now_ms, offset_at_ms);
            match day_idx - today_idx {
                0 => ("today".to_string(), "Today".to_string()),
                1 => ("tomorrow".to_string(), "Tomorrow".to_string()),
                -1 => ("yesterday".to_string(), "Yesterday".to_string()),
                2..=7 => ("next7".to_string(), "Next 7 days".to_string()),
                8..=30 => ("next30".to_string(), "Next 30 days".to_string()),
                -7..=-2 => ("last7".to_string(), "Last 7 days".to_string()),
                -30..=-8 => ("last30".to_string(), "Last 30 days".to_string()),
                _ => month_bucket(y, m),
            }
        }
        _ => month_bucket(y, m),
    }
}

fn number_group_key_and_label(v: f64) -> (String, String) {
    let bucket = (v / 10.0).floor() as i64;
    let key = format!("g:{bucket}");
    let label = if bucket >= 10 {
        ">= 100".to_string()
    } else {
        let low = bucket.saturating_mul(10);
        format!("{low} - {}", low.saturating_add(9))
    };
    (key, label)
}

/// Group rows into ordered buckets matching `0.27.5` `GroupTrait`, `define.ts`, and
/// `kanban/group-by-utils.ts`: honors `"Ungroups"` default-first ordering, `groupProperties`
/// manual order / `hide` / `manuallyCardSort`, `hideEmpty`, and date/number bucket titles.
pub fn group_database_rows(
    rows: &[DatabaseRow],
    group_by: &DatabaseGroupBy,
    group_properties: &[DatabaseGroupProperty],
    data: &DatabaseData,
    now_ms: i64,
    offset_at_ms: &dyn Fn(i64) -> i32,
) -> Vec<DatabaseGroupBucket> {
    let col = data.columns.iter().find(|c| c.id == group_by.column_id);
    let col_name = col.map_or("Value", |c| {
        if c.name.is_empty() {
            "Value"
        } else {
            c.name.as_str()
        }
    });
    let col_type = col.map_or(group_by.name.as_str(), |c| c.column_type.as_str());
    let default_hide_empty = !matches!(col_type, "select" | "multi-select");
    let hide_empty = group_by.hide_empty.unwrap_or(default_hide_empty);

    let mut key_meta: BTreeMap<String, (String, Option<String>)> = BTreeMap::new();
    let mut default_keys: Vec<String> = Vec::new();
    let no_value_key = UNGROUPS_KEY.to_string();
    let no_value_label = format!("No {col_name}");
    key_meta.insert(no_value_key.clone(), (no_value_label, None));

    // `0.27.5` `define.ts`: every non-boolean matcher seeds `defaultKeys` with `[ungroups, ...]`.
    if col_type != "checkbox" {
        default_keys.push(no_value_key.clone());
    }

    if matches!(col_type, "select" | "multi-select")
        && let Some(col) = col
    {
        for opt in col.select_options() {
            if !default_keys.contains(&opt.id) {
                default_keys.push(opt.id.clone());
            }
            key_meta.insert(opt.id, (opt.value, Some(opt.color)));
        }
    } else if col_type == "checkbox" {
        default_keys.push("true".to_string());
        default_keys.push("false".to_string());
        key_meta.insert(
            "true".to_string(),
            (
                "Checked".to_string(),
                Some("var(--affine-tag-green)".into()),
            ),
        );
        key_meta.insert(
            "false".to_string(),
            (
                "Unchecked".to_string(),
                Some("var(--affine-tag-gray)".into()),
            ),
        );
    }

    let is_date = col_type == "date" || group_by.name.starts_with("date");
    let is_number = col_type == "number" || group_by.name == "number";

    let mut bucket_rows: BTreeMap<String, Vec<DatabaseRow>> = BTreeMap::new();
    for row in rows {
        let cell = data
            .cells
            .get(&(row.row_id.clone(), group_by.column_id.clone()));
        let keys: Vec<String> = match (col_type, cell) {
            ("select", Some(DatabaseCellValue::Text(id))) if !id.is_empty() => vec![id.clone()],
            ("multi-select", Some(val)) => {
                let list = val.as_string_list();
                if list.is_empty() {
                    vec![no_value_key.clone()]
                } else {
                    list
                }
            }
            ("checkbox", Some(val)) => {
                let checked = val.as_bool().unwrap_or(false);
                vec![if checked { "true" } else { "false" }.to_string()]
            }
            ("checkbox", None) => vec!["false".to_string()],
            (_, Some(val)) if is_date => {
                if let Some(ts) = val.as_i64() {
                    let (k, label) =
                        date_group_key_and_label(ts, &group_by.name, now_ms, offset_at_ms);
                    key_meta.entry(k.clone()).or_insert_with(|| (label, None));
                    if !default_keys.contains(&k) {
                        default_keys.push(k.clone());
                    }
                    vec![k]
                } else {
                    vec![no_value_key.clone()]
                }
            }
            (_, Some(val)) if is_number => {
                if let Some(n) = val.as_f64() {
                    let (k, label) = number_group_key_and_label(n);
                    key_meta.entry(k.clone()).or_insert_with(|| (label, None));
                    if !default_keys.contains(&k) {
                        default_keys.push(k.clone());
                    }
                    vec![k]
                } else {
                    vec![no_value_key.clone()]
                }
            }
            (_, Some(val)) if !val.is_empty() => {
                let label = row_cell_text(data, row, &group_by.column_id);
                if label.is_empty() {
                    vec![no_value_key.clone()]
                } else {
                    let k = emotion_hash(&label);
                    key_meta
                        .entry(k.clone())
                        .or_insert_with(|| (label.clone(), None));
                    if !default_keys.contains(&k) {
                        default_keys.push(k.clone());
                    }
                    vec![k]
                }
            }
            _ => vec![no_value_key.clone()],
        };
        for key in keys {
            if !key_meta.contains_key(&key) {
                key_meta.insert(key.clone(), (key.clone(), None));
            }
            if !default_keys.contains(&key) {
                default_keys.push(key.clone());
            }
            bucket_rows.entry(key).or_default().push(row.clone());
        }
    }

    let sort_asc = group_by.sort.as_deref() != Some("desc");
    let ordered_keys: Vec<String> = if is_date {
        // `0.27.5` `trait.ts:96-98`: Date groups sort chronologically via `compareDateKeys`
        // (`Ungroups` last on ascending), ignoring manual `groupProperties` key order while
        // still honoring `groupProperties[].hide` and `manuallyCardSort` below.
        let mut keys = default_keys;
        keys.sort_by(|a, b| compare_date_keys(&group_by.name, sort_asc, a, b));
        keys
    } else {
        let manual_order: Vec<&str> = group_properties.iter().map(|g| g.key.as_str()).collect();
        let mut keys: Vec<String> = Vec::with_capacity(default_keys.len());
        for key in &manual_order {
            if default_keys.iter().any(|k| k == key) && !keys.iter().any(|k| k == key) {
                keys.push((*key).to_string());
            }
        }
        for key in default_keys {
            if !keys.contains(&key) {
                keys.push(key);
            }
        }
        if !sort_asc {
            keys.reverse();
        }
        keys
    };

    let mut buckets = Vec::new();
    for key in ordered_keys {
        let gp = group_properties.iter().find(|p| p.key == key);
        if gp.is_some_and(|p| p.hide) {
            continue;
        }
        let mut group_rows = bucket_rows.remove(&key).unwrap_or_default();
        if hide_empty && group_rows.is_empty() {
            continue;
        }
        if let Some(gp) = gp
            && !gp.manually_card_sort.is_empty()
        {
            let order = &gp.manually_card_sort;
            group_rows.sort_by_key(|r| {
                order
                    .iter()
                    .position(|id| id == &r.row_id)
                    .unwrap_or(usize::MAX)
            });
        }
        let (label, color) = key_meta
            .get(&key)
            .cloned()
            .unwrap_or_else(|| (key.clone(), None));
        buckets.push(DatabaseGroupBucket {
            key,
            label,
            color,
            rows: group_rows,
        });
    }
    buckets
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::read::{DatabaseColumn, RichText};
    use serde_json::json;

    fn make_row(id: &str) -> DatabaseRow {
        DatabaseRow {
            row_id: id.into(),
            title: RichText {
                plain: id.into(),
                delta: vec![],
            },
            created_at: None,
        }
    }

    #[test]
    fn ungroups_key_defaults_first_and_respects_hide_true() {
        let rows = vec![make_row("r1"), make_row("r2")];
        let mut cells = BTreeMap::new();
        cells.insert(
            ("r1".into(), "col-status".into()),
            DatabaseCellValue::Text("opt-todo".into()),
        );
        // r2 has no status -> Ungroups
        let data = DatabaseData {
            title: RichText::default(),
            columns: vec![DatabaseColumn {
                id: "col-status".into(),
                column_type: "select".into(),
                name: "Status".into(),
                data: json!({"options": [
                    {"id": "opt-todo", "value": "Todo", "color": "gray"},
                    {"id": "opt-done", "value": "Done", "color": "green"}
                ]}),
            }],
            views: vec![],
            cells,
            rows: rows.clone(),
        };
        let gb = DatabaseGroupBy {
            kind: "groupBy".into(),
            column_id: "col-status".into(),
            name: "select".into(),
            hide_empty: Some(false),
            sort: None,
        };
        let buckets = group_database_rows(&rows, &gb, &[], &data, 0, &|_| 0);
        let keys: Vec<&str> = buckets.iter().map(|b| b.key.as_str()).collect();
        assert_eq!(keys, vec!["Ungroups", "opt-todo", "opt-done"]);

        // Hiding "Ungroups" via groupProperties removes that lane.
        let hidden = group_database_rows(
            &rows,
            &gb,
            &[DatabaseGroupProperty {
                key: "Ungroups".into(),
                hide: true,
                manually_card_sort: vec![],
            }],
            &data,
            0,
            &|_| 0,
        );
        let hidden_keys: Vec<&str> = hidden.iter().map(|b| b.key.as_str()).collect();
        assert_eq!(hidden_keys, vec!["opt-todo", "opt-done"]);
    }

    #[test]
    fn date_month_and_number_group_titles_match_0275() {
        let rows = vec![make_row("r1"), make_row("r2"), make_row("r3")];
        let mut cells = BTreeMap::new();
        // 2026-03-10T12:00:00Z and 2026-03-11T12:00:00Z -> both "Mar 2026"
        cells.insert(
            ("r1".into(), "col-date".into()),
            DatabaseCellValue::Integer(1_773_144_000_000),
        );
        cells.insert(
            ("r2".into(), "col-date".into()),
            DatabaseCellValue::Integer(1_773_230_400_000),
        );
        cells.insert(
            ("r1".into(), "col-num".into()),
            DatabaseCellValue::Number(5.0),
        );
        cells.insert(
            ("r2".into(), "col-num".into()),
            DatabaseCellValue::Number(120.0),
        );
        let data = DatabaseData {
            title: RichText::default(),
            columns: vec![
                DatabaseColumn {
                    id: "col-date".into(),
                    column_type: "date".into(),
                    name: "Due".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-num".into(),
                    column_type: "number".into(),
                    name: "Score".into(),
                    data: json!({}),
                },
            ],
            views: vec![],
            cells,
            rows: rows.clone(),
        };

        let date_buckets = group_database_rows(
            &rows,
            &DatabaseGroupBy {
                kind: "groupBy".into(),
                column_id: "col-date".into(),
                name: "date-month".into(),
                hide_empty: Some(true),
                sort: None,
            },
            &[],
            &data,
            0,
            &|_| 0,
        );
        let mar = date_buckets
            .iter()
            .find(|b| b.label == "Mar 2026")
            .expect("Mar 2026 bucket");
        assert_eq!(mar.rows.len(), 2);
        assert!(
            date_buckets
                .iter()
                .any(|b| b.key == "Ungroups" && b.rows.len() == 1)
        );

        let num_buckets = group_database_rows(
            &rows,
            &DatabaseGroupBy {
                kind: "groupBy".into(),
                column_id: "col-num".into(),
                name: "number".into(),
                hide_empty: Some(true),
                sort: None,
            },
            &[],
            &data,
            0,
            &|_| 0,
        );
        let labels: Vec<&str> = num_buckets.iter().map(|b| b.label.as_str()).collect();
        assert!(labels.contains(&"0 - 9"), "got {labels:?}");
        assert!(labels.contains(&">= 100"), "got {labels:?}");
        assert!(labels.contains(&"No Score"), "got {labels:?}");

        // Exact `@emotion/hash@0.9.2` vectors for string group keys.
        for (input, expected) in [
            ("", "0"),
            ("a", "acqbnw"),
            ("abc", "1pgwlfu"),
            ("Alpha", "15hms44"),
            ("Hello World", "1lxg7gt"),
            ("日本語", "bypxjo"),
        ] {
            assert_eq!(emotion_hash(input), expected, "emotion_hash({input:?})");
        }

        // Exact `0.27.5` `define.ts` local-midnight UTC ms & `next7` keys + chronological sort:
        // NYC (`-300` min) 2026-01-05 15:00Z (`1767625200000`) -> local midnight `1767589200000`.
        let nyc_rows = vec![
            make_row("r-may"),
            make_row("r-jan5"),
            make_row("r-jan8"),
            make_row("r-empty"),
        ];
        let mut nyc_cells = BTreeMap::new();
        nyc_cells.insert(
            ("r-jan5".into(), "col-date".into()),
            DatabaseCellValue::Integer(1_767_625_200_000),
        );
        nyc_cells.insert(
            ("r-jan8".into(), "col-date".into()),
            DatabaseCellValue::Integer(1_767_884_400_000),
        );
        nyc_cells.insert(
            ("r-may".into(), "col-date".into()),
            DatabaseCellValue::Integer(1_779_282_000_000),
        );
        let nyc_data = DatabaseData {
            title: RichText::default(),
            columns: vec![DatabaseColumn {
                id: "col-date".into(),
                column_type: "date".into(),
                name: "Due".into(),
                data: json!({}),
            }],
            views: vec![],
            cells: nyc_cells,
            rows: nyc_rows.clone(),
        };
        let nyc_tz = |ms: i64| if ms >= 1_772_953_200_000 { -240 } else { -300 };
        let day_buckets = group_database_rows(
            &nyc_rows,
            &DatabaseGroupBy {
                kind: "groupBy".into(),
                column_id: "col-date".into(),
                name: "date-day".into(),
                hide_empty: Some(true),
                sort: None,
            },
            &[DatabaseGroupProperty {
                key: "1767589200000".into(),
                hide: true,
                manually_card_sort: vec![],
            }],
            &nyc_data,
            1_767_625_200_000,
            &nyc_tz,
        );
        let day_keys: Vec<&str> = day_buckets.iter().map(|b| b.key.as_str()).collect();
        // `1767589200000` (NYC Jan 5 EST) hidden by Web key; Jan 8 EST (`1767848400000`) sorts
        // before May 20 EDT (`1779249600000`), and Ungroups sorts last!
        assert_eq!(day_keys, vec!["1767848400000", "1779249600000", "Ungroups"]);

        let rel_buckets = group_database_rows(
            &nyc_rows,
            &DatabaseGroupBy {
                kind: "groupBy".into(),
                column_id: "col-date".into(),
                name: "date-relative".into(),
                hide_empty: Some(true),
                sort: None,
            },
            &[DatabaseGroupProperty {
                key: "next7".into(),
                hide: true,
                manually_card_sort: vec![],
            }],
            &nyc_data,
            1_767_625_200_000,
            &nyc_tz,
        );
        let rel_keys: Vec<&str> = rel_buckets.iter().map(|b| b.key.as_str()).collect();
        assert!(
            !rel_keys.contains(&"next7"),
            "Web hidden `next7` must stay hidden: {rel_keys:?}"
        );
        assert!(rel_keys.contains(&"today"));

        // Midnight spring-forward DST jump (`America/Havana` 2026-03-08 00:00 -> 01:00 at
        // `1772946000000` UTC): key must match Web `startOfDay` (`"1772946000000"`), not 23:00 CST.
        let havana_tz = |ms: i64| {
            if (1_772_946_000_000..1_793_509_200_000).contains(&ms) {
                -240
            } else {
                -300
            }
        };
        let (havana_key, havana_label) =
            date_group_key_and_label(1_772_982_000_000, "date-day", 1_772_982_000_000, &havana_tz);
        assert_eq!(
            (havana_key.as_str(), havana_label.as_str()),
            ("1772946000000", "Mar 8 2026")
        );
        let (havana_fall_key, _) =
            date_group_key_and_label(1_793_550_000_000, "date-day", 1_793_550_000_000, &havana_tz);
        assert_eq!(havana_fall_key, "1793505600000");
    }
}
