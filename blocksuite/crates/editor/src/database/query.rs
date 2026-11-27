//! Pure Filter and Sort evaluation for `affine:database` views, aligned with
//! `0.27.5` `core/filter/filter-fn/*.ts` and `core/sort/eval.ts`.

use std::cmp::Ordering;

use blocksuite_playground_doc::read::{DatabaseCellValue, DatabaseData, DatabaseRow};
use serde_json::Value as JsonValue;

/// Evaluate a BlockSuite `FilterGroup` / `Filter` tree against one database row.
pub fn eval_database_filter(filter: &JsonValue, data: &DatabaseData, row: &DatabaseRow) -> bool {
    let Some(obj) = filter.as_object() else {
        return true;
    };
    match obj.get("type").and_then(JsonValue::as_str) {
        Some("group") => {
            let Some(conditions) = obj.get("conditions").and_then(JsonValue::as_array) else {
                return true;
            };
            match obj.get("op").and_then(JsonValue::as_str) {
                Some("or") => conditions
                    .iter()
                    .any(|c| eval_database_filter(c, data, row)),
                _ => conditions
                    .iter()
                    .all(|c| eval_database_filter(c, data, row)),
            }
        }
        Some("filter") => eval_single_filter(obj, data, row),
        _ => true,
    }
}

fn eval_single_filter(
    obj: &serde_json::Map<String, JsonValue>,
    data: &DatabaseData,
    row: &DatabaseRow,
) -> bool {
    let Some(col_id) = obj
        .get("left")
        .and_then(|l| l.get("name"))
        .and_then(JsonValue::as_str)
    else {
        return true;
    };
    let Some(func) = obj.get("function").and_then(JsonValue::as_str) else {
        return true;
    };
    let arg0 = obj
        .get("args")
        .and_then(JsonValue::as_array)
        .and_then(|a| a.first())
        .and_then(|v| v.get("value"));
    let cell_text = row_cell_text(data, row, col_id);
    let cell_num = data
        .cells
        .get(&(row.row_id.clone(), col_id.to_string()))
        .and_then(DatabaseCellValue::as_f64);
    let cell_bool = data
        .cells
        .get(&(row.row_id.clone(), col_id.to_string()))
        .and_then(DatabaseCellValue::as_bool)
        .unwrap_or(false);
    let cell_list = data
        .cells
        .get(&(row.row_id.clone(), col_id.to_string()))
        .map(DatabaseCellValue::as_string_list)
        .unwrap_or_default();

    fn arg_str_list(arg: Option<&JsonValue>) -> Vec<&str> {
        arg.and_then(JsonValue::as_array)
            .map(|arr| arr.iter().filter_map(JsonValue::as_str).collect())
            .unwrap_or_default()
    }

    match func {
        "isEmpty" => cell_text.is_empty() && cell_list.is_empty() && cell_num.is_none(),
        "isNotEmpty" => !cell_text.is_empty() || !cell_list.is_empty() || cell_num.is_some(),
        "is" | "equal" => {
            let Some(arg) = arg0 else { return true };
            if let Some(s) = arg.as_str() {
                cell_text.to_lowercase() == s.to_lowercase()
                    || cell_list.iter().any(|item| item == s)
            } else if let Some(n) = arg.as_f64() {
                cell_num.is_some_and(|v| v == n)
            } else if let Some(b) = arg.as_bool() {
                cell_bool == b
            } else {
                true
            }
        }
        "isNot" | "notEqual" => {
            let Some(arg) = arg0 else { return true };
            if let Some(s) = arg.as_str() {
                cell_text.to_lowercase() != s.to_lowercase()
                    && !cell_list.iter().any(|item| item == s)
            } else if let Some(n) = arg.as_f64() {
                cell_num.is_some_and(|v| v != n)
            } else if let Some(b) = arg.as_bool() {
                cell_bool != b
            } else {
                true
            }
        }
        "contains" => arg0
            .and_then(JsonValue::as_str)
            .is_none_or(|needle| cell_text.to_lowercase().contains(&needle.to_lowercase())),
        "doesNoContains" | "doesNotContain" => arg0
            .and_then(JsonValue::as_str)
            .is_none_or(|needle| !cell_text.to_lowercase().contains(&needle.to_lowercase())),
        "startsWith" => arg0
            .and_then(JsonValue::as_str)
            .is_none_or(|prefix| cell_text.to_lowercase().starts_with(&prefix.to_lowercase())),
        "endsWith" => arg0
            .and_then(JsonValue::as_str)
            .is_none_or(|suffix| cell_text.to_lowercase().ends_with(&suffix.to_lowercase())),
        "greatThan" | "greaterThan" | "after" => arg0
            .and_then(JsonValue::as_f64)
            .is_none_or(|rhs| cell_num.is_some_and(|lhs| lhs > rhs)),
        "lessThan" | "before" => arg0
            .and_then(JsonValue::as_f64)
            .is_none_or(|rhs| cell_num.is_some_and(|lhs| lhs < rhs)),
        "greatThanOrEqual" | "greaterThanOrEqual" => arg0
            .and_then(JsonValue::as_f64)
            .is_none_or(|rhs| cell_num.is_some_and(|lhs| lhs >= rhs)),
        "lessThanOrEqual" => arg0
            .and_then(JsonValue::as_f64)
            .is_none_or(|rhs| cell_num.is_some_and(|lhs| lhs <= rhs)),
        "isOneOf" => {
            let targets = arg_str_list(arg0);
            if targets.is_empty() {
                true
            } else if cell_text.is_empty() && cell_list.is_empty() {
                false
            } else {
                targets
                    .iter()
                    .any(|t| cell_text == *t || cell_list.iter().any(|item| item == t))
            }
        }
        "isNotOneOf" => {
            let targets = arg_str_list(arg0);
            if targets.is_empty() {
                true
            } else if cell_text.is_empty() && cell_list.is_empty() {
                true
            } else {
                !targets
                    .iter()
                    .any(|t| cell_text == *t || cell_list.iter().any(|item| item == t))
            }
        }
        "containsOneOf" => {
            let targets = arg_str_list(arg0);
            if targets.is_empty() {
                true
            } else {
                targets
                    .iter()
                    .any(|t| cell_list.iter().any(|item| item == t) || cell_text == *t)
            }
        }
        "doesNotContainOneOf" => {
            let targets = arg_str_list(arg0);
            if targets.is_empty() {
                true
            } else {
                !targets
                    .iter()
                    .any(|t| cell_list.iter().any(|item| item == t) || cell_text == *t)
            }
        }
        "containsAll" => {
            let targets = arg_str_list(arg0);
            if targets.is_empty() {
                true
            } else {
                targets
                    .iter()
                    .all(|t| cell_list.iter().any(|item| item == t) || cell_text == *t)
            }
        }
        "doesNotContainAll" => {
            let targets = arg_str_list(arg0);
            if targets.is_empty() {
                true
            } else {
                !targets
                    .iter()
                    .all(|t| cell_list.iter().any(|item| item == t) || cell_text == *t)
            }
        }
        "isChecked" | "true" => cell_bool,
        "isUnchecked" | "false" => !cell_bool,
        _ => true,
    }
}

/// Sort filtered database rows according to `0.27.5` `view.sort`
/// (`{ sortBy: [{ ref: { name }, desc }] }`).
/// Empty/null values always sort last regardless of `desc`.
pub fn sort_database_rows(
    rows: &[DatabaseRow],
    sort: Option<&JsonValue>,
    data: &DatabaseData,
) -> Vec<DatabaseRow> {
    let mut out = rows.to_vec();
    let Some(rules) = sort
        .and_then(|s| s.get("sortBy"))
        .and_then(JsonValue::as_array)
        .filter(|list| !list.is_empty())
    else {
        return out;
    };
    let parsed: Vec<(&str, bool)> = rules
        .iter()
        .filter_map(|rule| {
            let col_id = rule
                .get("ref")
                .and_then(|r| r.get("name"))
                .and_then(JsonValue::as_str)?;
            let desc = rule
                .get("desc")
                .and_then(JsonValue::as_bool)
                .unwrap_or(false);
            Some((col_id, desc))
        })
        .collect();
    if parsed.is_empty() {
        return out;
    }
    stable_merge_sort(&mut out, |a, b| {
        for &(col_id, desc) in &parsed {
            let ord = compare_row_cells_with_direction(data, a, b, col_id, desc);
            if ord != Ordering::Equal {
                return ord;
            }
        }
        Ordering::Equal
    });
    out
}

/// Deterministic stable merge sort mirroring ECMAScript `Array.prototype.sort` (never panicking
/// under Rust `slice::sort_by` strict-weak-order checks when `0.27.5` `compareList` returns `0`
/// on matching shorter dot-separated prefixes).
fn stable_merge_sort<T: Clone>(items: &mut [T], mut cmp: impl FnMut(&T, &T) -> Ordering) {
    let n = items.len();
    if n < 2 {
        return;
    }
    let mut buf = items.to_vec();
    let mut width = 1_usize;
    while width < n {
        let mut left = 0_usize;
        while left < n {
            let mid = (left + width).min(n);
            let right = (left + 2 * width).min(n);
            let (mut i, mut j, mut k) = (left, mid, left);
            while i < mid && j < right {
                if cmp(&items[i], &items[j]) != Ordering::Greater {
                    buf[k] = items[i].clone();
                    i += 1;
                } else {
                    buf[k] = items[j].clone();
                    j += 1;
                }
                k += 1;
            }
            while i < mid {
                buf[k] = items[i].clone();
                i += 1;
                k += 1;
            }
            while j < right {
                buf[k] = items[j].clone();
                j += 1;
                k += 1;
            }
            left += 2 * width;
        }
        items.clone_from_slice(&buf);
        width *= 2;
    }
}

fn compare_row_cells_with_direction(
    data: &DatabaseData,
    a: &DatabaseRow,
    b: &DatabaseRow,
    col_id: &str,
    desc: bool,
) -> Ordering {
    let col = data.columns.iter().find(|c| c.id == col_id);
    let col_type = if col_id == "title" {
        "title"
    } else {
        col.map_or("rich-text", |c| c.column_type.as_str())
    };
    let va = data.cells.get(&(a.row_id.clone(), col_id.to_string()));
    let vb = data.cells.get(&(b.row_id.clone(), col_id.to_string()));

    let ord_opt: Option<Ordering> = match col_type {
        "number" | "progress" | "date" => compare_option_values(
            va.and_then(DatabaseCellValue::as_f64),
            vb.and_then(DatabaseCellValue::as_f64),
            |x, y| x.total_cmp(&y),
            desc,
        ),
        "created-time" => {
            let na = va
                .and_then(DatabaseCellValue::as_f64)
                .or(a.created_at.map(|ms| ms as f64));
            let nb = vb
                .and_then(DatabaseCellValue::as_f64)
                .or(b.created_at.map(|ms| ms as f64));
            compare_option_values(na, nb, |x, y| x.total_cmp(&y), desc)
        }
        "checkbox" => {
            let ba = va.and_then(DatabaseCellValue::as_bool).unwrap_or(false);
            let bb = vb.and_then(DatabaseCellValue::as_bool).unwrap_or(false);
            let ord = (ba as u8).cmp(&(bb as u8));
            Some(if desc { ord.reverse() } else { ord })
        }
        "select" => {
            let sa = va.and_then(|v| match v {
                DatabaseCellValue::Text(s) if !s.is_empty() => Some(s.as_str()),
                _ => None,
            });
            let sb = vb.and_then(|v| match v {
                DatabaseCellValue::Text(s) if !s.is_empty() => Some(s.as_str()),
                _ => None,
            });
            let options = col.map(|c| c.select_options()).unwrap_or_default();
            let idx = |id: &str| {
                options
                    .iter()
                    .position(|o| o.id == id)
                    .map_or(-1_isize, |i| i as isize)
            };
            compare_option_values(sa, sb, |x, y| idx(x).cmp(&idx(y)), desc)
        }
        "multi-select" => {
            let la = va
                .map(DatabaseCellValue::as_string_list)
                .filter(|v| !v.is_empty());
            let lb = vb
                .map(DatabaseCellValue::as_string_list)
                .filter(|v| !v.is_empty());
            let options = col.map(|c| c.select_options()).unwrap_or_default();
            let idx = |id: &str| {
                options
                    .iter()
                    .position(|o| o.id == id)
                    .map_or(-1_isize, |i| i as isize)
            };
            compare_option_values(
                la,
                lb,
                |x, y| {
                    for (xi, yi) in x.iter().zip(y.iter()) {
                        let o = idx(xi).cmp(&idx(yi));
                        if o != Ordering::Equal {
                            return o;
                        }
                    }
                    x.len().cmp(&y.len())
                },
                desc,
            )
        }
        _ => {
            let ta = row_cell_text(data, a, col_id);
            let tb = row_cell_text(data, b, col_id);
            compare_option_values(
                (!ta.is_empty()).then_some(ta),
                (!tb.is_empty()).then_some(tb),
                |x, y| compare_sort_string(&x, &y),
                desc,
            )
        }
    };
    ord_opt.unwrap_or(Ordering::Equal)
}

fn compare_option_values<T>(
    a: Option<T>,
    b: Option<T>,
    cmp: impl FnOnce(T, T) -> Ordering,
    desc: bool,
) -> Option<Ordering> {
    match (a, b) {
        (None, None) => Some(Ordering::Equal),
        (None, Some(_)) => Some(Ordering::Greater),
        (Some(_), None) => Some(Ordering::Less),
        (Some(va), Some(vb)) => {
            let ord = cmp(va, vb);
            Some(if desc { ord.reverse() } else { ord })
        }
    }
}

/// Aligns with `0.27.5` `core/sort/eval.ts` `compareString` & `compareList`:
/// dot-separated segments, lowercase, JS `Number.parseInt(low)` prefix integers
/// (including `0x`/`0X` hex prefixes) sort before non-numeric segments, NFD canonical
/// base-before-diacritic collation aligns `"École"` == `"E\u{0301}cole"` and `"École"` < `"Zulu"`,
/// and matching shorter prefixes return `Ordering::Equal` (`compareList` line 48).
fn compare_sort_string(a: &str, b: &str) -> Ordering {
    for (sa, sb) in a.split('.').zip(b.split('.')) {
        let la = sa.to_lowercase();
        let lb = sb.to_lowercase();
        let ord = match (js_parse_int_prefix(&la), js_parse_int_prefix(&lb)) {
            (Some(na), Some(nb)) => na
                .total_cmp(&nb)
                .then_with(|| compare_nfd_collation(&la, &lb)),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => compare_nfd_collation(&la, &lb),
        };
        if ord != Ordering::Equal {
            return ord;
        }
    }
    Ordering::Equal
}

fn is_combining_diacritic(ch: char) -> bool {
    matches!(
        ch as u32,
        0x0300..=0x036F
            | 0x1AB0..=0x1AFF
            | 0x1DC0..=0x1DFF
            | 0x20D0..=0x20FF
            | 0xFE20..=0xFE2F
    )
}

fn compare_nfd_collation(la: &str, lb: &str) -> Ordering {
    use unicode_normalization::UnicodeNormalization as _;
    let primary = la
        .nfd()
        .filter(|&c| !is_combining_diacritic(c))
        .cmp(lb.nfd().filter(|&c| !is_combining_diacritic(c)));
    if primary != Ordering::Equal {
        return primary;
    }
    la.nfd().cmp(lb.nfd())
}

fn js_parse_int_prefix(s: &str) -> Option<f64> {
    let trimmed = s.trim_start();
    let bytes = trimmed.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    let (sign, mut i) = match bytes[0] {
        b'-' => (-1.0_f64, 1_usize),
        b'+' => (1.0_f64, 1_usize),
        _ => (1.0_f64, 0_usize),
    };
    let (radix, digit_pred): (f64, fn(u8) -> Option<u8>) =
        if i + 2 <= bytes.len() && bytes[i] == b'0' && matches!(bytes[i + 1], b'x' | b'X') {
            i += 2;
            (16.0, |b| match b {
                b'0'..=b'9' => Some(b - b'0'),
                b'a'..=b'f' => Some(b - b'a' + 10),
                b'A'..=b'F' => Some(b - b'A' + 10),
                _ => None,
            })
        } else {
            (10.0, |b| b.is_ascii_digit().then(|| b - b'0'))
        };
    let start = i;
    let mut acc = 0.0_f64;
    while i < bytes.len() {
        let Some(d) = digit_pred(bytes[i]) else {
            break;
        };
        acc = acc * radix + f64::from(d);
        i += 1;
    }
    if i == start {
        return None;
    }
    Some(if acc == 0.0 { 0.0 } else { sign * acc })
}

pub(super) fn row_cell_text(data: &DatabaseData, row: &DatabaseRow, col_id: &str) -> String {
    if col_id == "title"
        || data
            .columns
            .iter()
            .find(|c| c.id == col_id)
            .is_some_and(|c| c.column_type == "title")
    {
        return row.title.plain.clone();
    }
    match data.cells.get(&(row.row_id.clone(), col_id.to_string())) {
        Some(DatabaseCellValue::Text(s)) => s.clone(),
        Some(DatabaseCellValue::RichText(rt)) => rt.plain.clone(),
        Some(DatabaseCellValue::Bool(b)) => b.to_string(),
        Some(DatabaseCellValue::Integer(n)) => n.to_string(),
        Some(DatabaseCellValue::Number(n)) => n.to_string(),
        Some(DatabaseCellValue::MultiSelect(items)) => items.join(", "),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::read::{DatabaseColumn, RichText};
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn database_filter_0275_wire_functions_table_driven() {
        let mut cells = BTreeMap::new();
        cells.insert(
            ("r1".into(), "col-num".into()),
            DatabaseCellValue::Number(100.0),
        );
        cells.insert(
            ("r1".into(), "col-str".into()),
            DatabaseCellValue::Text("Native Database".into()),
        );
        cells.insert(
            ("r1".into(), "col-tag".into()),
            DatabaseCellValue::Text("opt-doing".into()),
        );
        cells.insert(
            ("r1".into(), "col-tags".into()),
            DatabaseCellValue::MultiSelect(vec!["t-mobile".into(), "t-ui".into()]),
        );
        cells.insert(
            ("r1".into(), "col-done".into()),
            DatabaseCellValue::Bool(true),
        );
        cells.insert(
            ("r1".into(), "col-date".into()),
            DatabaseCellValue::Number(1_773_000_000_000.0),
        );
        cells.insert(
            ("r1".into(), "col-unicode".into()),
            DatabaseCellValue::Text("École".into()),
        );
        cells.insert(
            ("r1".into(), "col-tiny".into()),
            DatabaseCellValue::Number(0.0000000005),
        );

        let rt = |s: &str| RichText {
            plain: s.into(),
            delta: vec![],
        };
        let r1 = DatabaseRow {
            row_id: "r1".into(),
            title: rt("Row 1"),
            created_at: None,
        };
        let r_empty = DatabaseRow {
            row_id: "r-empty".into(),
            title: rt("Empty"),
            created_at: None,
        };
        let data = DatabaseData {
            title: rt("Tasks"),
            columns: vec![
                DatabaseColumn {
                    id: "col-num".into(),
                    column_type: "number".into(),
                    name: "Budget".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-str".into(),
                    column_type: "rich-text".into(),
                    name: "Note".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-tag".into(),
                    column_type: "select".into(),
                    name: "Status".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-tags".into(),
                    column_type: "multi-select".into(),
                    name: "Tags".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-done".into(),
                    column_type: "checkbox".into(),
                    name: "Done".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-date".into(),
                    column_type: "date".into(),
                    name: "Due".into(),
                    data: json!({}),
                },
            ],
            views: vec![],
            cells,
            rows: vec![r1.clone(), r_empty.clone()],
        };

        let rule = |col: &str, func: &str, arg: Option<JsonValue>| {
            let args = arg
                .map(|v| vec![json!({"type": "constant", "value": v})])
                .unwrap_or_default();
            json!({
                "type": "filter",
                "function": func,
                "left": {"type": "ref", "name": col},
                "args": args
            })
        };

        let cases: Vec<(&str, JsonValue, bool, bool)> = vec![
            (
                "greatThan true",
                rule("col-num", "greatThan", Some(json!(50))),
                true,
                false,
            ),
            (
                "greatThan false",
                rule("col-num", "greatThan", Some(json!(100))),
                false,
                false,
            ),
            (
                "greatThanOrEqual",
                rule("col-num", "greatThanOrEqual", Some(json!(100))),
                true,
                false,
            ),
            (
                "lessThanOrEqual",
                rule("col-num", "lessThanOrEqual", Some(json!(100))),
                true,
                false,
            ),
            (
                "equal num",
                rule("col-num", "equal", Some(json!(100))),
                true,
                false,
            ),
            (
                "notEqual num",
                rule("col-num", "notEqual", Some(json!(99))),
                true,
                false,
            ),
            (
                "doesNoContains",
                rule("col-str", "doesNoContains", Some(json!("kanban"))),
                true,
                true,
            ),
            (
                "doesNoContains miss",
                rule("col-str", "doesNoContains", Some(json!("DATA"))),
                false,
                true,
            ),
            (
                "startsWith",
                rule("col-str", "startsWith", Some(json!("native"))),
                true,
                false,
            ),
            (
                "endsWith",
                rule("col-str", "endsWith", Some(json!("BASE"))),
                true,
                false,
            ),
            (
                "isOneOf match",
                rule("col-tag", "isOneOf", Some(json!(["opt-todo", "opt-doing"]))),
                true,
                false,
            ),
            (
                "isOneOf empty arg",
                rule("col-tag", "isOneOf", Some(json!([]))),
                true,
                true,
            ),
            (
                "isNotOneOf",
                rule("col-tag", "isNotOneOf", Some(json!(["opt-todo"]))),
                true,
                true,
            ),
            (
                "isNotOneOf excluded",
                rule("col-tag", "isNotOneOf", Some(json!(["opt-doing"]))),
                false,
                true,
            ),
            (
                "containsOneOf",
                rule("col-tags", "containsOneOf", Some(json!(["t-ui", "t-core"]))),
                true,
                false,
            ),
            (
                "doesNotContainOneOf",
                rule("col-tags", "doesNotContainOneOf", Some(json!(["t-core"]))),
                true,
                true,
            ),
            (
                "containsAll hit",
                rule("col-tags", "containsAll", Some(json!(["t-mobile", "t-ui"]))),
                true,
                false,
            ),
            (
                "containsAll miss",
                rule(
                    "col-tags",
                    "containsAll",
                    Some(json!(["t-mobile", "t-core"])),
                ),
                false,
                false,
            ),
            (
                "doesNotContainAll",
                rule(
                    "col-tags",
                    "doesNotContainAll",
                    Some(json!(["t-mobile", "t-core"])),
                ),
                true,
                true,
            ),
            (
                "isChecked",
                rule("col-done", "isChecked", None),
                true,
                false,
            ),
            (
                "isUnchecked",
                rule("col-done", "isUnchecked", None),
                false,
                true,
            ),
            (
                "isNot bool",
                rule("col-done", "isNot", Some(json!(false))),
                true,
                false,
            ),
            (
                "before date",
                rule("col-date", "before", Some(json!(1_774_000_000_000_i64))),
                true,
                false,
            ),
            (
                "after date",
                rule("col-date", "after", Some(json!(1_772_000_000_000_i64))),
                true,
                false,
            ),
            (
                "unicode is case-insensitive",
                rule("col-unicode", "is", Some(json!("école"))),
                true,
                false,
            ),
            (
                "unicode isNot case-insensitive",
                rule("col-unicode", "isNot", Some(json!("école"))),
                false,
                true,
            ),
            (
                "exact f64 equal rejects 5e-10 vs 0.0",
                rule("col-tiny", "equal", Some(json!(0.0))),
                false,
                false,
            ),
            (
                "exact f64 notEqual accepts 5e-10 vs 0.0 and rejects empty",
                rule("col-tiny", "notEqual", Some(json!(0.0))),
                true,
                false,
            ),
        ];

        for (label, filter, exp_r1, exp_empty) in cases {
            assert_eq!(
                eval_database_filter(&filter, &data, &r1),
                exp_r1,
                "r1 failed for {label}"
            );
            assert_eq!(
                eval_database_filter(&filter, &data, &r_empty),
                exp_empty,
                "r_empty failed for {label}"
            );
        }

        // Empty `or` group returns `false`, empty `and` group returns `true`.
        let empty_or = json!({"type": "group", "op": "or", "conditions": []});
        let empty_and = json!({"type": "group", "op": "and", "conditions": []});
        let nested_empty_or = json!({
            "type": "group",
            "op": "and",
            "conditions": [
                rule("col-num", "equal", Some(json!(100))),
                empty_or
            ]
        });
        assert!(!eval_database_filter(&empty_or, &data, &r1));
        assert!(eval_database_filter(&empty_and, &data, &r1));
        assert!(!eval_database_filter(&nested_empty_or, &data, &r1));
    }

    #[test]
    fn database_sort_0275_sort_by_and_eval_comparators() {
        let rt = |s: &str| RichText {
            plain: s.into(),
            delta: vec![],
        };
        let rows: Vec<DatabaseRow> = [
            ("r-alpha", "Alpha"),
            ("r-bravo", "Bravo"),
            ("r-charlie", "Charlie"),
            ("r-delta", "Delta"),
            ("r-echo", "Echo"),
            ("r-foxtrot", "Foxtrot"),
        ]
        .into_iter()
        .map(|(id, title)| DatabaseRow {
            row_id: id.into(),
            title: rt(title),
            created_at: None,
        })
        .collect();

        let mut cells = BTreeMap::new();
        // Number: Alpha=10, Bravo=empty, Charlie=50, Delta=20, Echo=empty, Foxtrot=5
        cells.insert(
            ("r-alpha".into(), "col-num".into()),
            DatabaseCellValue::Number(10.0),
        );
        cells.insert(
            ("r-charlie".into(), "col-num".into()),
            DatabaseCellValue::Number(50.0),
        );
        cells.insert(
            ("r-delta".into(), "col-num".into()),
            DatabaseCellValue::Number(20.0),
        );
        cells.insert(
            ("r-foxtrot".into(), "col-num".into()),
            DatabaseCellValue::Number(5.0),
        );

        // Rich-text: ["banana", "Apple", "", "cherry", "10.b", "2.a"]
        for (id, text) in [
            ("r-alpha", "banana"),
            ("r-bravo", "Apple"),
            ("r-charlie", ""),
            ("r-delta", "cherry"),
            ("r-echo", "10.b"),
            ("r-foxtrot", "2.a"),
        ] {
            cells.insert(
                (id.into(), "col-str".into()),
                DatabaseCellValue::Text(text.into()),
            );
        }

        // Select options order: [opt-todo (Todo), opt-doing (In Progress), opt-done (Done)]
        for (id, opt) in [
            ("r-alpha", "opt-done"),
            ("r-bravo", "opt-todo"),
            ("r-delta", "opt-doing"),
            ("r-foxtrot", "opt-todo"),
        ] {
            cells.insert(
                (id.into(), "col-status".into()),
                DatabaseCellValue::Text(opt.into()),
            );
        }

        let data = DatabaseData {
            title: rt("Sort Test"),
            columns: vec![
                DatabaseColumn {
                    id: "col-num".into(),
                    column_type: "number".into(),
                    name: "Score".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-str".into(),
                    column_type: "rich-text".into(),
                    name: "Note".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-status".into(),
                    column_type: "select".into(),
                    name: "Status".into(),
                    data: json!({
                        "options": [
                            {"id": "opt-todo", "value": "Todo", "color": "var(--affine-tag-gray)"},
                            {"id": "opt-doing", "value": "In Progress", "color": "var(--affine-tag-blue)"},
                            {"id": "opt-done", "value": "Done", "color": "var(--affine-tag-green)"}
                        ]
                    }),
                },
            ],
            views: vec![],
            cells,
            rows: rows.clone(),
        };

        let ids_of = |sorted: Vec<DatabaseRow>| -> Vec<String> {
            sorted.into_iter().map(|r| r.title.plain).collect()
        };

        // (a) Number desc: 50, 20, 10, 5, empty (Bravo, Echo) ALWAYS last.
        let sort_num_desc = json!({
            "sortBy": [{"ref": {"type": "ref", "name": "col-num"}, "desc": true}]
        });
        assert_eq!(
            ids_of(sort_database_rows(&rows, Some(&sort_num_desc), &data)),
            vec!["Charlie", "Delta", "Alpha", "Foxtrot", "Bravo", "Echo"]
        );

        // (b) Rich-text asc: ["2.a", "10.b", "Apple", "banana", "cherry", ""]
        let sort_str_asc = json!({
            "sortBy": [{"ref": {"type": "ref", "name": "col-str"}, "desc": false}]
        });
        let sorted_str: Vec<String> = sort_database_rows(&rows, Some(&sort_str_asc), &data)
            .iter()
            .map(|r| row_cell_text(&data, r, "col-str"))
            .collect();
        assert_eq!(
            sorted_str,
            vec!["2.a", "10.b", "Apple", "banana", "cherry", ""]
        );

        // (c) Select asc & desc by options order [Todo, In Progress, Done], empty always last.
        let sort_sel_asc = json!({
            "sortBy": [{"ref": {"type": "ref", "name": "col-status"}, "desc": false}]
        });
        assert_eq!(
            ids_of(sort_database_rows(&rows, Some(&sort_sel_asc), &data)),
            vec!["Bravo", "Foxtrot", "Delta", "Alpha", "Charlie", "Echo"]
        );
        let sort_sel_desc = json!({
            "sortBy": [{"ref": {"type": "ref", "name": "col-status"}, "desc": true}]
        });
        assert_eq!(
            ids_of(sort_database_rows(&rows, Some(&sort_sel_desc), &data)),
            vec!["Alpha", "Delta", "Bravo", "Foxtrot", "Charlie", "Echo"]
        );

        // (d) `0.27.5` `eval.ts` `compareList` prefix equality (`["1.2", "1"]` stays in order),
        // `Number.parseInt` hex prefix (`["10", "0x20"]` -> 10 < 32), NFD canonical diacritic
        // collation (`"École"` == `"E\u{0301}cole"` and `"École"` < `"Zulu"`), and 80-row
        // stability without Rust `slice::sort_by` non-total-order panic.
        assert_eq!(compare_sort_string("1.2", "1"), Ordering::Equal);
        assert_eq!(compare_sort_string("10", "0x20"), Ordering::Less);
        assert_eq!(
            compare_sort_string("École", "E\u{0301}cole"),
            Ordering::Equal
        );
        assert_eq!(compare_sort_string("École", "Zulu"), Ordering::Less);
        assert_eq!(compare_sort_string("ecole", "école"), Ordering::Less);

        let seed_titles = [
            "1.2",
            "1",
            "1.3",
            "1.1",
            "1.10",
            "2",
            "2.1",
            "École",
            "E\u{0301}cole",
            "Zulu",
        ];
        let many_rows: Vec<DatabaseRow> = (0..80)
            .map(|i| DatabaseRow {
                row_id: format!("m-{i}"),
                title: rt(seed_titles[i % seed_titles.len()]),
                created_at: None,
            })
            .collect();
        let many_data = DatabaseData {
            title: rt("Many"),
            columns: vec![DatabaseColumn {
                id: "title".into(),
                column_type: "title".into(),
                name: "Title".into(),
                data: json!({}),
            }],
            views: vec![],
            cells: BTreeMap::new(),
            rows: many_rows.clone(),
        };
        for desc in [false, true] {
            let rule = json!({
                "sortBy": [{"ref": {"type": "ref", "name": "title"}, "desc": desc}]
            });
            let sorted = sort_database_rows(&many_rows, Some(&rule), &many_data);
            assert_eq!(sorted.len(), 80);
        }
    }
}
