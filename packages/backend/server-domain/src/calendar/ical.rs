//! Streaming WebDAV XML (via `xmlparser`, XXE-safe) and iCalendar VEVENT
//! parsers for CalDAV discovery and event synchronization.
use super::{CalendarError, CalendarProviderEvent, CalendarProviderEventRaw, CalendarProviderEventTime};
use chrono::{DateTime, Datelike, NaiveDate, Timelike, Utc};
use std::sync::Arc;
const MAX_XML_DEPTH: usize = 64;
const MAX_XML_ENTITY_LEN: usize = 16;
#[derive(Clone, Debug, Default)]
pub struct DavPropstat {
  pub status_code: Option<u16>,
  pub displayname: Option<String>,
  pub is_calendar: bool,
  pub current_user_principal_href: Option<String>,
  pub principal_url_href: Option<String>,
  pub calendar_home_set_href: Option<String>,
  pub calendar_timezone: Option<String>,
  pub calendar_color: Option<String>,
  pub getetag: Option<String>,
  pub calendar_data: Option<String>,
}
#[derive(Clone, Debug, Default)]
pub struct DavResponse {
  pub href: Option<String>,
  pub status_code: Option<u16>,
  pub propstats: Vec<DavPropstat>,
}
impl DavResponse {
  /// Returns the first 2xx (or status-less) propstat, falling back to the first
  /// propstat if present, matching `caldav.ts:getPropstat`.
  pub fn best_propstat(&self) -> Option<&DavPropstat> {
    if self.propstats.is_empty() {
      return None;
    }
    for ps in &self.propstats {
      match ps.status_code {
        None => return Some(ps),
        Some(code) if (200..300).contains(&code) => return Some(ps),
        _ => {}
      }
    }
    self.propstats.first()
  }
  /// Returns true when the response or any of its propstats has HTTP status 404.
  pub fn is_not_found(&self) -> bool {
    self.status_code == Some(404) || self.propstats.iter().any(|ps| ps.status_code == Some(404))
  }
}
#[derive(Clone, Debug, Default)]
pub struct DavMultistatus {
  pub responses: Vec<DavResponse>,
  pub sync_token: Option<String>,
}
fn parse_http_status_code(text: &str) -> Option<u16> {
  for token in text.split_whitespace() {
    if token.len() == 3
      && token.bytes().all(|b| b.is_ascii_digit())
      && let Ok(code) = token.parse::<u16>()
    {
      return Some(code);
    }
  }
  None
}
pub fn decode_xml_entities(input: &str) -> String {
  if !input.contains('&') {
    return input.to_owned();
  }
  let mut out = String::with_capacity(input.len());
  let bytes = input.as_bytes();
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'&'
      && let Some(semi_rel) = bytes[i..bytes.len().min(i + MAX_XML_ENTITY_LEN)]
        .iter()
        .position(|&b| b == b';')
    {
      let entity = &input[i + 1..i + semi_rel];
      let decoded = match entity {
        "lt" => Some('<'),
        "gt" => Some('>'),
        "amp" => Some('&'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        _ if entity.starts_with("#x") || entity.starts_with("#X") => {
          u32::from_str_radix(&entity[2..], 16).ok().and_then(char::from_u32)
        }
        _ if entity.starts_with('#') => entity[1..].parse::<u32>().ok().and_then(char::from_u32),
        _ => None,
      };
      if let Some(ch) = decoded {
        out.push(ch);
        i += semi_rel + 1;
        continue;
      }
    }
    let ch = input[i..].chars().next().unwrap_or('\0');
    out.push(ch);
    i += ch.len_utf8();
  }
  out
}
/// Parses a WebDAV `multistatus` XML payload using streaming `xmlparser`.
/// DTD declarations and external entities are ignored/rejected (XXE-safe).
pub fn parse_multistatus(xml: &str) -> DavMultistatus {
  let mut result = DavMultistatus::default();
  let mut stack: Vec<String> = Vec::new();
  let mut current_response: Option<DavResponse> = None;
  let mut current_propstat: Option<DavPropstat> = None;
  let mut text_buf = String::new();
  for token in xmlparser::Tokenizer::from(xml) {
    let Ok(tok) = token else {
      break;
    };
    match tok {
      xmlparser::Token::DtdStart { .. }
      | xmlparser::Token::EntityDeclaration { .. }
      | xmlparser::Token::DtdEnd { .. } => {
        // Ignore DTD/entity declarations completely (XXE-safe).
      }
      xmlparser::Token::ElementStart { local, .. } => {
        if stack.len() >= MAX_XML_DEPTH {
          break;
        }
        let name = local.as_str().to_ascii_lowercase();
        text_buf.clear();
        if name == "response" {
          current_response = Some(DavResponse::default());
        } else if name == "propstat" && current_response.is_some() {
          current_propstat = Some(DavPropstat::default());
        } else if name == "calendar"
          && stack.last().is_some_and(|p| p == "resourcetype")
          && let Some(ps) = current_propstat.as_mut()
        {
          ps.is_calendar = true;
        }
        stack.push(name);
      }
      xmlparser::Token::ElementEnd { end, .. } => {
        let closing = matches!(end, xmlparser::ElementEnd::Empty | xmlparser::ElementEnd::Close(_, _));
        if !closing {
          continue;
        }
        let Some(closed) = stack.pop() else {
          continue;
        };
        let parent = stack.last().map(String::as_str);
        let grandparent = stack
          .len()
          .checked_sub(2)
          .and_then(|idx| stack.get(idx))
          .map(String::as_str);
        let text = text_buf.trim().to_owned();
        match closed.as_str() {
          "response" => {
            if let Some(resp) = current_response.take() {
              result.responses.push(resp);
            }
          }
          "propstat" => {
            if let (Some(resp), Some(ps)) = (current_response.as_mut(), current_propstat.take()) {
              resp.propstats.push(ps);
            }
          }
          "sync-token" if parent == Some("multistatus") => {
            if !text.is_empty() {
              result.sync_token = Some(text);
            }
          }
          "href" => {
            if !text.is_empty() {
              match parent {
                Some("response") => {
                  if let Some(resp) = current_response.as_mut() {
                    resp.href = Some(text);
                  }
                }
                Some("current-user-principal") => {
                  if let Some(ps) = current_propstat.as_mut()
                    && ps.current_user_principal_href.is_none()
                  {
                    ps.current_user_principal_href = Some(text);
                  }
                }
                Some("principal-url") => {
                  if let Some(ps) = current_propstat.as_mut()
                    && ps.principal_url_href.is_none()
                  {
                    ps.principal_url_href = Some(text);
                  }
                }
                Some("calendar-home-set") => {
                  if let Some(ps) = current_propstat.as_mut()
                    && ps.calendar_home_set_href.is_none()
                  {
                    ps.calendar_home_set_href = Some(text);
                  }
                }
                _ => {}
              }
            }
          }
          "status" => {
            let code = parse_http_status_code(&text);
            if parent == Some("propstat") {
              if let Some(ps) = current_propstat.as_mut() {
                ps.status_code = code;
              }
            } else if parent == Some("response")
              && let Some(resp) = current_response.as_mut()
            {
              resp.status_code = code;
            }
          }
          "displayname" if parent == Some("prop") => {
            if let Some(ps) = current_propstat.as_mut()
              && !text.is_empty()
            {
              ps.displayname = Some(text);
            }
          }
          "calendar-timezone" if parent == Some("prop") => {
            if let Some(ps) = current_propstat.as_mut()
              && !text.is_empty()
            {
              ps.calendar_timezone = extract_calendar_timezone(&text);
            }
          }
          "calendar-color" if parent == Some("prop") => {
            if let Some(ps) = current_propstat.as_mut()
              && !text.is_empty()
            {
              ps.calendar_color = Some(text);
            }
          }
          "getetag" if parent == Some("prop") => {
            if let Some(ps) = current_propstat.as_mut()
              && !text.is_empty()
            {
              ps.getetag = Some(text);
            }
          }
          "calendar-data" if parent == Some("prop") || grandparent == Some("prop") => {
            if let Some(ps) = current_propstat.as_mut()
              && !text_buf.trim().is_empty()
            {
              ps.calendar_data = Some(text_buf.clone());
            }
          }
          _ => {}
        }
        text_buf.clear();
      }
      xmlparser::Token::Text { text } => {
        text_buf.push_str(&decode_xml_entities(text.as_str()));
      }
      xmlparser::Token::Cdata { text, .. } => {
        text_buf.push_str(text.as_str());
      }
      _ => {}
    }
  }
  result
}
pub fn extract_calendar_timezone(text: &str) -> Option<String> {
  for line in text.lines() {
    if let Some(rest) = line.trim().strip_prefix("TZID:") {
      let tz = rest.trim();
      if !tz.is_empty() {
        return Some(tz.to_owned());
      }
    }
  }
  None
}
pub fn escape_xml(input: &str) -> String {
  let mut out = String::with_capacity(input.len());
  for ch in input.chars() {
    match ch {
      '&' => out.push_str("&amp;"),
      '<' => out.push_str("&lt;"),
      '>' => out.push_str("&gt;"),
      '"' => out.push_str("&quot;"),
      '\'' => out.push_str("&apos;"),
      _ => out.push(ch),
    }
  }
  out
}
pub fn format_utc_for_ical(iso: &str) -> String {
  if let Ok(dt) = DateTime::parse_from_rfc3339(iso) {
    return dt.with_timezone(&Utc).format("%Y%m%dT%H%M%SZ").to_string();
  }
  iso.to_owned()
}
fn unescape_ical_text(value: &str) -> String {
  let mut out = String::with_capacity(value.len());
  let mut chars = value.chars().peekable();
  while let Some(ch) = chars.next() {
    if ch == '\\'
      && let Some(&next) = chars.peek()
      && let Some(rep) = match next {
        'n' | 'N' => Some('\n'),
        ',' | ';' | '\\' => Some(next),
        _ => None,
      }
    {
      chars.next();
      out.push(rep);
      continue;
    }
    out.push(ch);
  }
  out
}
fn unfold_ical_lines(content: &str) -> Vec<String> {
  let mut unfolded: Vec<String> = Vec::new();
  for line in content.split('\n').map(|l| l.trim_end_matches('\r')) {
    if line.is_empty() {
      continue;
    }
    if line.starts_with(' ') || line.starts_with('\t') {
      if let Some(prev) = unfolded.last_mut() {
        prev.push_str(&line[1..]);
      } else {
        unfolded.push(line[1..].to_owned());
      }
    } else {
      unfolded.push(line.to_owned());
    }
  }
  unfolded
}
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
  let y = y - i64::from(m <= 2);
  let era = y.div_euclid(400);
  let yoe = y - era * 400;
  let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
  let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  era * 146_097 + doe - 719_468
}
fn civil_from_days(z: i64) -> (i64, u32, u32) {
  let z = z + 719_468;
  let era = z.div_euclid(146_097);
  let doe = (z - era * 146_097) as u64;
  let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
  let y = yoe as i64 + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
  let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
  (y + i64::from(m <= 2), m, d)
}
fn parse_digits(b: &[u8]) -> Option<u32> {
  if b.is_empty() || !b.iter().all(u8::is_ascii_digit) {
    return None;
  }
  b.iter()
    .try_fold(0u32, |acc, &c| acc.checked_mul(10)?.checked_add(u32::from(c - b'0')))
}
pub fn format_epoch_millis_iso(ms: i64) -> String {
  let (year, month, day) = civil_from_days(ms.div_euclid(86_400_000));
  let rem = ms.rem_euclid(86_400_000);
  let (hour, min, sec, milli) = (rem / 3_600_000, (rem / 60_000) % 60, (rem / 1000) % 60, rem % 1000);
  if (0..=9999).contains(&year) {
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}.{milli:03}Z")
  } else {
    let sign = if year < 0 { '-' } else { '+' };
    format!(
      "{sign}{:06}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}.{milli:03}Z",
      year.unsigned_abs()
    )
  }
}
/// Formats a UTC `DateTime` identically to JS `Date.toISOString()` (`YYYY-MM-DDTHH:MM:SS.000Z`).
pub fn format_utc_millis(dt: DateTime<Utc>) -> String {
  format_epoch_millis_iso(dt.timestamp_millis())
}
fn js_date_utc(year: i32, month_idx: i64, day: i32, hour: i32, min: i32, sec: i32, ms: i32) -> Option<DateTime<Utc>> {
  let eff_year = if (0..=99).contains(&year) { 1900 + year } else { year };
  let total_months = i64::from(eff_year) * 12 + month_idx;
  let norm_y = i32::try_from(total_months.div_euclid(12)).ok()?;
  let norm_m = (total_months.rem_euclid(12) + 1) as u32;
  let base = NaiveDate::from_ymd_opt(norm_y, norm_m, 1)?
    .and_hms_opt(0, 0, 0)?
    .and_utc();
  base
    .checked_add_signed(chrono::Duration::days(i64::from(day) - 1))?
    .checked_add_signed(chrono::Duration::seconds(
      i64::from(hour) * 3600 + i64::from(min) * 60 + i64::from(sec),
    ))?
    .checked_add_signed(chrono::Duration::milliseconds(i64::from(ms)))
}
fn parse_fixed_tz_offset(name: &str) -> Option<i64> {
  let b = name.as_bytes();
  if !name.is_ascii() || !matches!(b.first(), Some(b'+' | b'-')) {
    return None;
  }
  let sign = if b[0] == b'-' { -1 } else { 1 };
  let (hh, mm): (u32, u32) = match b.len() {
    3 if b[1..3].iter().all(u8::is_ascii_digit) => (name[1..3].parse().ok()?, 0),
    5 if b[1..5].iter().all(u8::is_ascii_digit) => (name[1..3].parse().ok()?, name[3..5].parse().ok()?),
    6 if b[3] == b':' && b[1..3].iter().all(u8::is_ascii_digit) && b[4..6].iter().all(u8::is_ascii_digit) => {
      (name[1..3].parse().ok()?, name[4..6].parse().ok()?)
    }
    _ => return None,
  };
  (hh <= 23 && mm <= 59).then(|| sign * (i64::from(hh) * 3600 + i64::from(mm) * 60))
}
fn resolve_tz_offset_secs(utc_guess: DateTime<Utc>, tzid: Option<&str>) -> Result<i64, CalendarError> {
  const GREGORIAN_400Y_SECS: i64 = 146_097 * 86_400;
  let Some(name) = tzid else {
    return Ok(0);
  };
  if let Some(secs) = parse_fixed_tz_offset(name) {
    return Ok(secs);
  }
  let tz = if name.is_empty() || name.bytes().any(|b| b.is_ascii_whitespace()) {
    None
  } else {
    jiff::tz::TimeZone::get(name).ok()
  }
  .ok_or_else(|| CalendarError::Internal(format!("Invalid time zone specified: {name}")))?;
  let secs = utc_guess.timestamp();
  let ts = match jiff::Timestamp::from_second(secs) {
    Ok(ts) => ts,
    Err(_) if secs > 0 => {
      let max_s = jiff::Timestamp::MAX.as_second();
      let k = (secs - max_s + GREGORIAN_400Y_SECS - 1) / GREGORIAN_400Y_SECS;
      jiff::Timestamp::from_second(secs - k * GREGORIAN_400Y_SECS).unwrap_or(jiff::Timestamp::MAX)
    }
    Err(_) => jiff::Timestamp::MIN,
  };
  Ok(i64::from(tz.to_offset(ts).seconds()))
}
fn finish_offset_at_utc_guess(ug: DateTime<Utc>, tzid: Option<&str>) -> Result<Option<DateTime<Utc>>, CalendarError> {
  let Some(local) = ug.checked_add_signed(chrono::Duration::seconds(resolve_tz_offset_secs(ug, tzid)?)) else {
    return Ok(None);
  };
  let Some(y) = (if local.year() >= 1 {
    Some(local.year())
  } else {
    1i32.checked_sub(local.year())
  }) else {
    return Ok(None);
  };
  let Some(as_utc) = js_date_utc(
    y,
    i64::from(local.month()) - 1,
    local.day() as i32,
    local.hour() as i32,
    local.minute() as i32,
    local.second() as i32,
    0,
  ) else {
    return Ok(None);
  };
  Ok(
    (2 * i128::from(ug.timestamp_millis()) - i128::from(as_utc.timestamp_millis()))
      .try_into()
      .ok()
      .and_then(DateTime::<Utc>::from_timestamp_millis),
  )
}
pub fn try_offset_at_utc_guess_i32(
  year: i32,
  month: i32,
  day: i32,
  hour: i32,
  minute: i32,
  second: i32,
  tzid: Option<&str>,
) -> Result<Option<DateTime<Utc>>, CalendarError> {
  let Some(ug) = js_date_utc(year, i64::from(month) - 1, day, hour, minute, second, 0) else {
    return Ok(None);
  };
  finish_offset_at_utc_guess(ug, tzid)
}
pub fn try_offset_at_utc_guess_ymd_f64(
  year: f64,
  month_idx: f64,
  day: f64,
  tzid: Option<&str>,
) -> Result<Option<DateTime<Utc>>, CalendarError> {
  if !year.is_finite() || !month_idx.is_finite() || !day.is_finite() {
    return Ok(None);
  }
  let (yi, mi, di) = (year.trunc(), month_idx.trunc(), day.trunc());
  let eff_y = if (0.0..=99.0).contains(&yi) { 1900.0 + yi } else { yi };
  let ym = eff_y + (mi / 12.0).floor();
  let mn = mi.rem_euclid(12.0);
  if !ym.is_finite() || ym.abs() > 1.0e12 || di.abs() > 4.0e14 {
    return Ok(None);
  }
  let days = i128::from(days_from_civil(ym as i64, (mn as i64) + 1, 1)) + (di as i128) - 1;
  if !(-100_000_000..=100_000_000).contains(&days) {
    return Ok(None);
  }
  let Some(ug) = DateTime::<Utc>::from_timestamp_millis((days as i64) * 86_400_000) else {
    return Ok(None);
  };
  finish_offset_at_utc_guess(ug, tzid)
}
pub fn try_offset_at_utc_guess(
  year: i16,
  month: i8,
  day: i8,
  hour: i8,
  minute: i8,
  second: i8,
  tzid: Option<&str>,
) -> Result<Option<DateTime<Utc>>, CalendarError> {
  try_offset_at_utc_guess_i32(
    i32::from(year),
    i32::from(month),
    i32::from(day),
    i32::from(hour),
    i32::from(minute),
    i32::from(second),
    tzid,
  )
}
pub fn offset_at_utc_guess(
  year: i16,
  month: i8,
  day: i8,
  hour: i8,
  minute: i8,
  second: i8,
  tzid: Option<&str>,
) -> Option<DateTime<Utc>> {
  try_offset_at_utc_guess(year, month, day, hour, minute, second, tzid)
    .ok()
    .flatten()
}
pub fn process_local_tz() -> jiff::tz::TimeZone {
  match std::env::var("TZ") {
    Err(_) => jiff::tz::TimeZone::system(),
    Ok(v) if matches!(v.as_str(), "" | "UTC" | "Etc/UTC" | "GMT" | ":UTC" | ":Etc/UTC") => jiff::tz::TimeZone::UTC,
    Ok(v) => {
      let name = v.strip_prefix(':').unwrap_or(&v);
      jiff::tz::TimeZone::get(name)
        .or_else(|_| jiff::tz::TimeZone::posix(&v))
        .unwrap_or_else(|_| jiff::tz::TimeZone::system())
    }
  }
}
pub fn parse_js_iso_millis(s: &str) -> Option<i64> {
  parse_js_iso_millis_opt_tz(s, None)
}
pub fn parse_js_iso_millis_in_tz(s: &str, local_tz: &jiff::tz::TimeZone) -> Option<i64> {
  parse_js_iso_millis_opt_tz(s, Some(local_tz))
}
fn parse_js_iso_millis_opt_tz(s: &str, local_tz: Option<&jiff::tz::TimeZone>) -> Option<i64> {
  if !s.is_ascii() {
    return None;
  }
  let b = s.as_bytes();
  let (year, rest): (i64, &[u8]) = if b.len() >= 7 && matches!(b[0], b'+' | b'-') {
    let y_abs = parse_digits(&b[1..7])?;
    if b[0] == b'-' && y_abs == 0 {
      return None;
    }
    (
      if b[0] == b'-' {
        -i64::from(y_abs)
      } else {
        i64::from(y_abs)
      },
      &b[7..],
    )
  } else if b.len() >= 4 {
    (i64::from(parse_digits(&b[..4])?), &b[4..])
  } else {
    return None;
  };
  let (m, has_m, rest): (u32, bool, &[u8]) = if rest.starts_with(b"-") {
    let m = parse_digits(rest.get(1..3)?)?;
    if !(1..=12).contains(&m) {
      return None;
    }
    (m, true, &rest[3..])
  } else {
    (1, false, rest)
  };
  let (d, rest): (u32, &[u8]) = if has_m && rest.starts_with(b"-") {
    let d = parse_digits(rest.get(1..3)?)?;
    if !(1..=31).contains(&d) {
      return None;
    }
    (d, &rest[3..])
  } else {
    (1, rest)
  };
  let (h, mi, sc, ms, off_secs): (u32, u32, u32, u32, i64) = if rest.is_empty() {
    (0, 0, 0, 0, 0)
  } else {
    if rest.len() < 6 || !matches!(rest[0], b'T' | b't') || rest[3] != b':' {
      return None;
    }
    let (h, mi) = (parse_digits(&rest[1..3])?, parse_digits(&rest[4..6])?);
    let r3 = &rest[6..];
    let (sc, ms, frac_zero, tz) = if r3.starts_with(b":") {
      if r3.len() < 3 {
        return None;
      }
      let sc = parse_digits(&r3[1..3])?;
      let r4 = &r3[3..];
      if let Some(a) = r4.strip_prefix(b".") {
        let n = a.iter().take_while(|c| c.is_ascii_digit()).count();
        if n == 0 {
          return None;
        }
        let frac_zero = a[..n].iter().all(|&c| c == b'0');
        let f = (0..3).fold(0u32, |acc, i| acc * 10 + if i < n { u32::from(a[i] - b'0') } else { 0 });
        (sc, f, frac_zero, &a[n..])
      } else {
        (sc, 0, true, r4)
      }
    } else {
      (0, 0, true, r3)
    };
    if !((h <= 23 && mi <= 59 && sc <= 59) || (h == 24 && mi == 0 && sc == 0 && frac_zero)) {
      return None;
    }
    let off = if tz.is_empty() {
      const DAYS_9999_12_25: i64 = 2_932_890;
      const DAYS_400Y: i64 = 146_097;
      let raw_days = days_from_civil(year, i64::from(m), 1) + i64::from(d) - 1 + i64::from(h == 24);
      let folded = if raw_days > DAYS_9999_12_25 {
        raw_days - ((raw_days - DAYS_9999_12_25 + DAYS_400Y - 1) / DAYS_400Y) * DAYS_400Y
      } else if raw_days < -3_651_000 {
        -3_651_000
      } else {
        raw_days
      };
      let (fy, fm, fd) = civil_from_days(folded);
      let h_eff = if h == 24 { 0 } else { h };
      let date = jiff::civil::Date::new(fy as i16, fm as i8, fd as i8).ok()?;
      let time = jiff::civil::Time::new(h_eff as i8, mi as i8, sc as i8, 0).ok()?;
      let civil_dt = jiff::civil::DateTime::from_parts(date, time);
      let civil_utc_secs = folded * 86_400 + i64::from(h_eff) * 3600 + i64::from(mi) * 60 + i64::from(sc);
      let owned_tz;
      let tz_ref = match local_tz {
        Some(t) => t,
        None => {
          owned_tz = process_local_tz();
          &owned_tz
        }
      };
      civil_utc_secs - tz_ref.to_zoned(civil_dt).ok()?.timestamp().as_second()
    } else if tz == b"Z" || tz == b"z" {
      0
    } else if matches!(tz.first(), Some(b'+' | b'-')) && (tz.len() == 5 || (tz.len() == 6 && tz[3] == b':')) {
      let sign = if tz[0] == b'-' { -1 } else { 1 };
      let hh = parse_digits(&tz[1..3])?;
      let mm = parse_digits(if tz.len() == 5 { &tz[3..5] } else { &tz[4..6] })?;
      if hh > 23 || mm > 59 {
        return None;
      }
      sign * (i64::from(hh) * 3600 + i64::from(mm) * 60)
    } else {
      return None;
    };
    (h, mi, sc, ms, off)
  };
  let days = i128::from(days_from_civil(year, i64::from(m), 1)) + i128::from(d) - 1;
  let total_ms = days * 86_400_000
    + (i128::from(h) * 3600 + i128::from(mi) * 60 + i128::from(sc) - i128::from(off_secs)) * 1000
    + i128::from(ms);
  (-8_640_000_000_000_000..=8_640_000_000_000_000)
    .contains(&total_ms)
    .then_some(total_ms as i64)
}
pub fn parse_js_iso_datetime(s: &str) -> Option<DateTime<Utc>> {
  parse_js_iso_millis(s).and_then(DateTime::<Utc>::from_timestamp_millis)
}
fn parse_ical_date(value: &str) -> Option<String> {
  if !value.is_ascii() || value.len() != 8 || !value.bytes().all(|b| b.is_ascii_digit()) {
    return None;
  }
  Some(format!("{}-{}-{}", &value[0..4], &value[4..6], &value[6..8]))
}
fn parse_ical_datetime_to_rfc3339(
  value: &str,
  tzid: Option<&str>,
  href: &str,
) -> Result<Option<String>, CalendarError> {
  let bytes = value.as_bytes();
  if !value.is_ascii()
    || bytes.len() < 15
    || !bytes[..8].iter().all(u8::is_ascii_digit)
    || bytes[8] != b'T'
    || !bytes[9..15].iter().all(u8::is_ascii_digit)
  {
    return Ok(None);
  }
  let suffix = &value[15..];
  let is_z = suffix == "Z";
  let is_off = suffix.len() == 5
    && matches!(suffix.as_bytes()[0], b'+' | b'-')
    && suffix.as_bytes()[1..].iter().all(u8::is_ascii_digit);
  if is_z || is_off {
    let inv = || CalendarError::Internal("Invalid time value".to_owned());
    let year: i32 = value[0..4].parse().map_err(|_| inv())?;
    let month: u32 = value[4..6].parse().map_err(|_| inv())?;
    let day: u32 = value[6..8].parse().map_err(|_| inv())?;
    let hour: u32 = value[9..11].parse().map_err(|_| inv())?;
    let min: u32 = value[11..13].parse().map_err(|_| inv())?;
    let sec: u32 = value[13..15].parse().map_err(|_| inv())?;
    let valid_time = (hour <= 23 && min <= 59 && sec <= 59) || (hour == 24 && min == 0 && sec == 0);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || !valid_time {
      return Err(inv());
    }
    let offset_secs: i64 = if is_z {
      0
    } else {
      parse_fixed_tz_offset(suffix).ok_or_else(inv)?
    };
    let base = NaiveDate::from_ymd_opt(year, month, 1)
      .and_then(|d| d.and_hms_opt(0, 0, 0))
      .ok_or_else(inv)?
      .and_utc();
    let dt = base
      + chrono::Duration::days(i64::from(day) - 1)
      + chrono::Duration::seconds(i64::from(hour) * 3600 + i64::from(min) * 60 + i64::from(sec) - offset_secs);
    return Ok(Some(format_utc_millis(dt)));
  }
  if !suffix.is_empty() {
    return Ok(None);
  }
  let Some(name) = tzid.filter(|s| !s.is_empty()) else {
    return Ok(Some(format!(
      "{}-{}-{}T{}:{}:{}Z",
      &value[0..4],
      &value[4..6],
      &value[6..8],
      &value[9..11],
      &value[11..13],
      &value[13..15],
    )));
  };
  let (Ok(year), Ok(month), Ok(day), Ok(hour), Ok(minute), Ok(second)) = (
    value[0..4].parse::<i16>(),
    value[4..6].parse::<i8>(),
    value[6..8].parse::<i8>(),
    value[9..11].parse::<i8>(),
    value[11..13].parse::<i8>(),
    value[13..15].parse::<i8>(),
  ) else {
    return Ok(None);
  };
  let dt = try_offset_at_utc_guess(year, month, day, hour, minute, second, Some(name)).inspect_err(|_| {
    tracing::warn!(tzid = %name, href = %href, "unsupported calendar timezone");
  })?;
  Ok(dt.map(format_utc_millis))
}
fn parse_ical_time(
  value: &str,
  tzid: Option<&str>,
  href: &str,
) -> Result<Option<CalendarProviderEventTime>, CalendarError> {
  if !value.is_ascii() {
    return Ok(None);
  }
  if value.len() == 8 && value.bytes().all(|b| b.is_ascii_digit()) {
    return Ok(parse_ical_date(value).map(|date| CalendarProviderEventTime {
      date_time: None,
      date: Some(date),
      time_zone: tzid.map(str::to_owned),
    }));
  }
  Ok(
    parse_ical_datetime_to_rfc3339(value, tzid, href)?.map(|dt| CalendarProviderEventTime {
      date_time: Some(dt),
      date: None,
      time_zone: tzid.map(str::to_owned),
    }),
  )
}
/// Parses all `VEVENT` blocks from an iCalendar payload into canonical
/// [`CalendarProviderEvent`] records, returning an error on unsupported `TZID`.
pub fn try_parse_ical_events(
  ical: &str,
  href: &str,
  etag: Option<&str>,
) -> Result<Vec<CalendarProviderEvent>, CalendarError> {
  use std::collections::HashMap;
  let mut events = Vec::new();
  let shared_ical: Arc<str> = Arc::from(ical);
  let lines = unfold_ical_lines(ical);
  type IcalPropMap = HashMap<String, Vec<(String, HashMap<String, String>)>>;
  let mut current: Option<IcalPropMap> = None;
  let mut nested_depth: usize = 0;
  for line in lines {
    if current.is_none() {
      if line == "BEGIN:VEVENT" {
        current = Some(HashMap::new());
        nested_depth = 0;
      }
      continue;
    }
    if line.starts_with("BEGIN:") {
      nested_depth = nested_depth.saturating_add(1);
      continue;
    }
    if nested_depth > 0 {
      if line.starts_with("END:") {
        nested_depth -= 1;
      }
      continue;
    }
    if line == "END:VEVENT" {
      let Some(props) = current.take() else {
        continue;
      };
      let read_prop = |name: &str| props.get(name).and_then(|v| v.first());
      let uid = read_prop("UID")
        .map(|(v, _)| v.clone())
        .unwrap_or_else(|| href.to_owned());
      let summary = read_prop("SUMMARY").map(|(v, _)| unescape_ical_text(v));
      let description = read_prop("DESCRIPTION").map(|(v, _)| unescape_ical_text(v));
      let location = read_prop("LOCATION").map(|(v, _)| unescape_ical_text(v));
      let status = read_prop("STATUS").map(|(v, _)| v.to_ascii_lowercase());
      let start = read_prop("DTSTART")
        .map(|(v, p)| parse_ical_time(v, p.get("TZID").map(String::as_str), href))
        .transpose()?
        .flatten();
      let end = match read_prop("DTEND") {
        Some((v, p)) => parse_ical_time(v, p.get("TZID").map(String::as_str), href)?,
        None => start.clone(),
      };
      let original_start_time = read_prop("RECURRENCE-ID")
        .map(|(v, p)| parse_ical_time(v, p.get("TZID").map(String::as_str), href))
        .transpose()?
        .flatten();
      let (Some(start), Some(end)) = (start, end) else {
        continue;
      };
      let updated = read_prop("LAST-MODIFIED")
        .or_else(|| read_prop("DTSTAMP"))
        .map(|(v, _)| parse_ical_datetime_to_rfc3339(v, None, href))
        .transpose()?
        .flatten();
      events.push(CalendarProviderEvent {
        id: href.to_owned(),
        status,
        etag: etag.map(str::to_owned),
        summary,
        description,
        location,
        updated,
        recurring_event_id: Some(uid.clone()),
        original_start_time,
        start,
        end,
        raw: CalendarProviderEventRaw::Ical {
          ical: Arc::clone(&shared_ical),
          href: href.to_owned(),
          etag: etag.map(str::to_owned),
          uid,
        },
      });
      continue;
    }
    let Some(props) = current.as_mut() else {
      continue;
    };
    let Some((name_part, value)) = line.split_once(':') else {
      continue;
    };
    let mut parts = name_part.split(';');
    let Some(raw_name) = parts.next() else {
      continue;
    };
    let mut line_params = HashMap::new();
    for part in parts {
      if let Some((k, v)) = part.split_once('=')
        && !k.is_empty()
      {
        line_params.insert(k.to_ascii_uppercase(), v.to_owned());
      }
    }
    props
      .entry(raw_name.to_ascii_uppercase())
      .or_default()
      .push((value.to_owned(), line_params));
  }
  Ok(events)
}
pub fn parse_ical_events(ical: &str, href: &str, etag: Option<&str>) -> Vec<CalendarProviderEvent> {
  try_parse_ical_events(ical, href, etag).unwrap_or_default()
}
