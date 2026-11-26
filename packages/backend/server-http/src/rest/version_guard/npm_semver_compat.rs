// compat(parity): version-guard-npm-node-semver-quirks -- replicates node-semver whitespace and range parsing quirks of v0.27.5
//! `node-semver` compatible version and range parsing, including its
//! whitespace and loose range rules.

pub(super) fn is_ecmascript_whitespace(c: char) -> bool {
  matches!(
    c,
    '\u{0009}' | '\u{000A}' | '\u{000B}' | '\u{000C}' | '\u{000D}' | '\u{0020}' | '\u{00A0}' | '\u{1680}' | '\u{2000}'
      ..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}'
  )
}

pub(super) fn trim_ecmascript(s: &str) -> &str {
  s.trim_matches(is_ecmascript_whitespace)
}

pub(super) fn split_ecmascript_whitespace(s: &str) -> impl Iterator<Item = &str> {
  s.split(is_ecmascript_whitespace).filter(|part| !part.is_empty())
}

#[derive(Clone, Debug)]
pub(super) enum PrereleaseIdent {
  SafeInt(u64),
  BigNumeric { raw: String, value: f64 },
  AlphaNumeric(String),
}

impl PrereleaseIdent {
  pub(super) fn same_js_value(&self, other: &Self) -> bool {
    match (self, other) {
      (Self::SafeInt(a), Self::SafeInt(b)) => a == b,
      (Self::BigNumeric { raw: a, .. }, Self::BigNumeric { raw: b, .. }) => a == b,
      (Self::AlphaNumeric(a), Self::AlphaNumeric(b)) => a == b,
      _ => false,
    }
  }

  pub(super) fn numeric_f64(&self) -> Option<f64> {
    match self {
      Self::SafeInt(n) => Some(*n as f64),
      Self::BigNumeric { value, .. } => Some(*value),
      Self::AlphaNumeric(_) => None,
    }
  }

  pub(super) fn compare_identifiers_js(&self, other: &Self) -> std::cmp::Ordering {
    match (self.numeric_f64(), other.numeric_f64()) {
      (Some(a), Some(b)) => a.total_cmp(&b),
      (Some(_), None) => std::cmp::Ordering::Less,
      (None, Some(_)) => std::cmp::Ordering::Greater,
      (None, None) => match (self, other) {
        (Self::AlphaNumeric(a), Self::AlphaNumeric(b)) => a.cmp(b),
        _ => std::cmp::Ordering::Equal,
      },
    }
  }
}

#[derive(Clone, Debug)]
pub(super) struct Semver {
  pub(super) major: u64,
  pub(super) minor: u64,
  pub(super) patch: u64,
  pub(super) prerelease: Vec<PrereleaseIdent>,
}

impl Semver {
  pub(super) fn release(major: u64, minor: u64, patch: u64) -> Self {
    Self {
      major,
      minor,
      patch,
      prerelease: Vec::new(),
    }
  }

  /// Smallest possible prerelease sentinel (`X.Y.Z-0`), matching npm
  /// `node-semver` exclusive upper bounds so `<2.0.0-0` rejects `2.0.0-alpha.1`
  /// even under `includePrerelease: true`.
  pub(super) fn prerelease_zero(major: u64, minor: u64, patch: u64) -> Self {
    Self {
      major,
      minor,
      patch,
      prerelease: vec![PrereleaseIdent::SafeInt(0)],
    }
  }

  /// Matches `semver@7.8.1` `SemVer.prototype.compare` + `comparePre` 1:1.
  pub(super) fn compare_semver(&self, other: &Self) -> std::cmp::Ordering {
    let main = (self.major, self.minor, self.patch).cmp(&(other.major, other.minor, other.patch));
    if main != std::cmp::Ordering::Equal {
      return main;
    }
    match (self.prerelease.is_empty(), other.prerelease.is_empty()) {
      (true, true) => std::cmp::Ordering::Equal,
      (true, false) => std::cmp::Ordering::Greater,
      (false, true) => std::cmp::Ordering::Less,
      (false, false) => {
        let mut i = 0;
        loop {
          match (self.prerelease.get(i), other.prerelease.get(i)) {
            (None, None) => return std::cmp::Ordering::Equal,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(a), Some(b)) => {
              if a.same_js_value(b) {
                i += 1;
                continue;
              }
              return a.compare_identifiers_js(b);
            }
          }
        }
      }
    }
  }
}

impl PartialEq for Semver {
  fn eq(&self, other: &Self) -> bool {
    self.compare_semver(other) == std::cmp::Ordering::Equal
  }
}

impl Eq for Semver {}

impl Ord for Semver {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    self.compare_semver(other)
  }
}

impl PartialOrd for Semver {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    Some(self.cmp(other))
  }
}

pub(super) const MAX_SEMVER_LENGTH: usize = 256;
pub(super) const MAX_SAFE_BUILD_LENGTH: usize = 250;
pub(super) const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

pub(super) fn parse_strict_numeric(part: &str) -> Option<u64> {
  if part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()) {
    return None;
  }
  if part.len() > 1 && part.starts_with('0') {
    return None;
  }
  let val = part.parse::<u64>().ok()?;
  (val <= MAX_SAFE_INTEGER).then_some(val)
}

pub(super) fn parse_prerelease_list(pre: &str) -> Option<Vec<PrereleaseIdent>> {
  if pre.is_empty() {
    return None;
  }
  let mut out = Vec::new();
  for ident in pre.split('.') {
    if ident.is_empty() || !ident.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
      return None;
    }
    if ident.bytes().all(|b| b.is_ascii_digit()) {
      if ident.len() > 1 && ident.starts_with('0') {
        return None;
      }
      if let Ok(n) = ident.parse::<u64>()
        && n < MAX_SAFE_INTEGER
      {
        out.push(PrereleaseIdent::SafeInt(n));
      } else {
        let value = ident.parse::<f64>().ok().filter(|v| v.is_finite())?;
        out.push(PrereleaseIdent::BigNumeric {
          raw: ident.to_owned(),
          value,
        });
      }
    } else {
      if ident.len() > MAX_SAFE_BUILD_LENGTH {
        return None;
      }
      out.push(PrereleaseIdent::AlphaNumeric(ident.to_owned()));
    }
  }
  Some(out)
}

pub(super) fn is_valid_build_metadata(build: &str) -> bool {
  !build.is_empty()
    && build.split('.').all(|seg| {
      !seg.is_empty()
        && seg.len() <= MAX_SAFE_BUILD_LENGTH
        && seg.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    })
}

pub(crate) fn is_newer_semver(current: &str, candidate: &str) -> bool {
  let (c, n) = (current.trim(), candidate.trim());
  if n.is_empty() {
    return false;
  }
  match (parse_semver(c), parse_semver(n)) {
    (Some(cv), Some(nv)) => nv.compare_semver(&cv) == std::cmp::Ordering::Greater,
    _ => c != n,
  }
}

pub(super) fn parse_semver(input: &str) -> Option<Semver> {
  if input.encode_utf16().count() > MAX_SEMVER_LENGTH {
    return None;
  }
  let trimmed = trim_ecmascript(input);
  let s = trimmed.strip_prefix('v').unwrap_or(trimmed);
  let (without_build, _) = match s.split_once('+') {
    Some((before, build)) => {
      if !is_valid_build_metadata(build) {
        return None;
      }
      (before, Some(build))
    }
    None => (s, None),
  };
  let (core, pre_opt) = match without_build.split_once('-') {
    Some((c, p)) => (c, Some(p)),
    None => (without_build, None),
  };
  let mut parts = core.split('.');
  let major = parse_strict_numeric(parts.next()?)?;
  let minor = parse_strict_numeric(parts.next()?)?;
  let patch = parse_strict_numeric(parts.next()?)?;
  if parts.next().is_some() {
    return None;
  }
  let prerelease = match pre_opt {
    Some(pre) => parse_prerelease_list(pre)?,
    None => Vec::new(),
  };
  Some(Semver {
    major,
    minor,
    patch,
    prerelease,
  })
}

pub(super) fn is_wildcard(s: &str) -> bool {
  matches!(s, "*" | "x" | "X")
}

/// Strips all valid `+build` metadata segments matching `semver@7.8.1`
/// `BUILDSTRIPRE = \+[0-9A-Za-z-]{1,250}(?:\.[0-9A-Za-z-]{1,250})*`.
pub(super) fn strip_build_metadata(input: &str) -> String {
  let bytes = input.as_bytes();
  let is_build_char = |b: u8| b.is_ascii_alphanumeric() || b == b'-';
  let mut out = String::with_capacity(input.len());
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'+' {
      let mut j = i + 1;
      let mut seg_len = 0usize;
      while j < bytes.len() && is_build_char(bytes[j]) && seg_len < MAX_SAFE_BUILD_LENGTH {
        j += 1;
        seg_len += 1;
      }
      if seg_len > 0 {
        while j < bytes.len() && bytes[j] == b'.' {
          let dot_pos = j;
          let mut k = dot_pos + 1;
          let mut next_len = 0usize;
          while k < bytes.len() && is_build_char(bytes[k]) && next_len < MAX_SAFE_BUILD_LENGTH {
            k += 1;
            next_len += 1;
          }
          if next_len > 0 {
            j = k;
          } else {
            break;
          }
        }
        i = j;
        continue;
      }
    }
    let ch = input[i..].chars().next().unwrap();
    out.push(ch);
    i += ch.len_utf8();
  }
  out
}

#[derive(Clone, Debug)]
pub(super) struct PartialVersion {
  pub(super) major: Option<u64>,
  pub(super) minor: Option<u64>,
  pub(super) patch: Option<u64>,
  pub(super) prerelease: Vec<PrereleaseIdent>,
}

pub(super) fn parse_partial_version(input: &str) -> Option<PartialVersion> {
  let s = input
    .trim_start_matches(|c: char| c == 'v' || c == '=' || is_ecmascript_whitespace(c))
    .trim_end_matches(is_ecmascript_whitespace);
  if s.is_empty() {
    return None;
  }
  let (core, pre_opt) = match s.split_once('-') {
    Some((c, p)) => (c, Some(p)),
    None => (s, None),
  };
  let parts: Vec<&str> = core.split('.').collect();
  if parts.is_empty() || parts.len() > 3 {
    return None;
  }
  let parse_part = |s: &str| -> Option<Option<u64>> {
    if is_wildcard(s) {
      Some(None)
    } else {
      Some(Some(parse_strict_numeric(s)?))
    }
  };
  let raw_major = parse_part(parts[0])?;
  let raw_minor = if parts.len() >= 2 { parse_part(parts[1])? } else { None };
  let raw_patch = if parts.len() == 3 { parse_part(parts[2])? } else { None };

  // semver@7.8.1: xM = isX(M), xm = xM || isX(m), xp = xm || isX(p).
  let major = raw_major;
  let minor = if major.is_none() { None } else { raw_minor };
  let patch = if minor.is_none() { None } else { raw_patch };

  let prerelease = match pre_opt {
    Some(pre) => {
      if parts.len() != 3 {
        return None;
      }
      let parsed = parse_prerelease_list(pre)?;
      if patch.is_none() { Vec::new() } else { parsed }
    }
    None => Vec::new(),
  };

  Some(PartialVersion {
    major,
    minor,
    patch,
    prerelease,
  })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum RangeOp {
  Any,
  Eq,
  Lt,
  Lte,
  Gt,
  Gte,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct Comparator {
  pub(super) op: RangeOp,
  pub(super) version: Semver,
}

impl Comparator {
  pub(super) fn any() -> Self {
    Self {
      op: RangeOp::Any,
      version: Semver::release(0, 0, 0),
    }
  }

  pub(super) fn is_empty_set(&self) -> bool {
    self.op == RangeOp::Lt && self.version == Semver::prerelease_zero(0, 0, 0)
  }

  pub(super) fn matches(&self, candidate: &Semver) -> bool {
    match self.op {
      RangeOp::Any => true,
      RangeOp::Eq => candidate == &self.version,
      RangeOp::Lt => candidate < &self.version,
      RangeOp::Lte => candidate <= &self.version,
      RangeOp::Gt => candidate > &self.version,
      RangeOp::Gte => candidate >= &self.version,
    }
  }
}

pub(super) fn expand_caret(p: &PartialVersion) -> Option<Vec<Comparator>> {
  let Some(major) = p.major else {
    return Some(vec![Comparator::any()]);
  };
  let lower = if p.minor.is_none() || p.patch.is_none() {
    Semver::prerelease_zero(major, p.minor.unwrap_or(0), 0)
  } else if !p.prerelease.is_empty() {
    Semver {
      major,
      minor: p.minor.unwrap_or(0),
      patch: p.patch.unwrap_or(0),
      prerelease: p.prerelease.clone(),
    }
  } else if major == 0 {
    // semver@7.8.1 replaceCaret: ^0.m.p adds -0 sentinel to lower bound.
    Semver::prerelease_zero(0, p.minor.unwrap_or(0), p.patch.unwrap_or(0))
  } else {
    Semver::release(major, p.minor.unwrap_or(0), p.patch.unwrap_or(0))
  };
  let upper = match (major, p.minor, p.patch) {
    (0, None, _) => Semver::prerelease_zero(1, 0, 0),
    (0, Some(0), None) => Semver::prerelease_zero(0, 1, 0),
    (0, Some(0), Some(patch)) => Semver::prerelease_zero(0, 0, patch.checked_add(1)?),
    (0, Some(minor), _) => Semver::prerelease_zero(0, minor.checked_add(1)?, 0),
    (m, _, _) => Semver::prerelease_zero(m.checked_add(1)?, 0, 0),
  };
  Some(vec![
    Comparator {
      op: RangeOp::Gte,
      version: lower,
    },
    Comparator {
      op: RangeOp::Lt,
      version: upper,
    },
  ])
}

pub(super) fn expand_tilde(p: &PartialVersion) -> Option<Vec<Comparator>> {
  let Some(major) = p.major else {
    return Some(vec![Comparator::any()]);
  };
  // semver@7.8.1 replaceTilde: lower bound does NOT add -0 for partial or full versions.
  let lower = Semver {
    major,
    minor: p.minor.unwrap_or(0),
    patch: p.patch.unwrap_or(0),
    prerelease: p.prerelease.clone(),
  };
  let upper = match p.minor {
    Some(minor) => Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
    None => Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
  };
  Some(vec![
    Comparator {
      op: RangeOp::Gte,
      version: lower,
    },
    Comparator {
      op: RangeOp::Lt,
      version: upper,
    },
  ])
}

pub(super) fn expand_x_range(op: Option<RangeOp>, p: &PartialVersion) -> Option<Vec<Comparator>> {
  let Some(major) = p.major else {
    return match op {
      None | Some(RangeOp::Eq) | Some(RangeOp::Gte) | Some(RangeOp::Lte) => Some(vec![Comparator::any()]),
      Some(RangeOp::Lt) | Some(RangeOp::Gt) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(0, 0, 0),
      }]),
      Some(RangeOp::Any) => Some(vec![Comparator::any()]),
    };
  };

  match (p.minor, p.patch) {
    (Some(minor), Some(patch)) => {
      let ver = Semver {
        major,
        minor,
        patch,
        prerelease: p.prerelease.clone(),
      };
      Some(vec![Comparator {
        op: op.unwrap_or(RangeOp::Eq),
        version: ver,
      }])
    }
    (Some(minor), None) => match op {
      None | Some(RangeOp::Eq) => Some(vec![
        Comparator {
          op: RangeOp::Gte,
          version: Semver::prerelease_zero(major, minor, 0),
        },
        Comparator {
          op: RangeOp::Lt,
          version: Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
        },
      ]),
      Some(RangeOp::Gte) => Some(vec![Comparator {
        op: RangeOp::Gte,
        version: Semver::prerelease_zero(major, minor, 0),
      }]),
      Some(RangeOp::Gt) => Some(vec![Comparator {
        op: RangeOp::Gte,
        version: Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
      }]),
      Some(RangeOp::Lte) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
      }]),
      Some(RangeOp::Lt) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major, minor, 0),
      }]),
      Some(RangeOp::Any) => Some(vec![Comparator::any()]),
    },
    (None, _) => match op {
      None | Some(RangeOp::Eq) => Some(vec![
        Comparator {
          op: RangeOp::Gte,
          version: Semver::prerelease_zero(major, 0, 0),
        },
        Comparator {
          op: RangeOp::Lt,
          version: Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
        },
      ]),
      Some(RangeOp::Gte) => Some(vec![Comparator {
        op: RangeOp::Gte,
        version: Semver::prerelease_zero(major, 0, 0),
      }]),
      Some(RangeOp::Gt) => Some(vec![Comparator {
        op: RangeOp::Gte,
        version: Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
      }]),
      Some(RangeOp::Lte) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
      }]),
      Some(RangeOp::Lt) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major, 0, 0),
      }]),
      Some(RangeOp::Any) => Some(vec![Comparator::any()]),
    },
  }
}

pub(super) fn expand_hyphen(from_str: &str, to_str: &str) -> Option<Vec<Comparator>> {
  let from = parse_partial_version(from_str)?;
  let to = parse_partial_version(to_str)?;
  let mut out = Vec::new();
  if let Some(major) = from.major {
    let lower = if from.minor.is_none() || from.patch.is_none() {
      Semver::prerelease_zero(major, from.minor.unwrap_or(0), 0)
    } else if !from.prerelease.is_empty() {
      Semver {
        major,
        minor: from.minor.unwrap_or(0),
        patch: from.patch.unwrap_or(0),
        prerelease: from.prerelease,
      }
    } else {
      // semver@7.8.1 hyphenReplace(true): full M.m.p without prerelease adds -0.
      Semver::prerelease_zero(major, from.minor.unwrap_or(0), from.patch.unwrap_or(0))
    };
    out.push(Comparator {
      op: RangeOp::Gte,
      version: lower,
    });
  }
  if let Some(major) = to.major {
    match (to.minor, to.patch) {
      (Some(minor), Some(patch)) => {
        if !to.prerelease.is_empty() {
          out.push(Comparator {
            op: RangeOp::Lte,
            version: Semver {
              major,
              minor,
              patch,
              prerelease: to.prerelease,
            },
          });
        } else {
          out.push(Comparator {
            op: RangeOp::Lt,
            version: Semver::prerelease_zero(major, minor, patch.checked_add(1)?),
          });
        }
      }
      (Some(minor), None) => out.push(Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
      }),
      (None, _) => out.push(Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
      }),
    }
  }
  if out.is_empty() {
    out.push(Comparator::any());
  }
  Some(out)
}

#[derive(Clone, Debug)]
pub(super) struct SemverRange {
  /// Disjunction (`||`) of conjunctions (space-separated comparators).
  pub(super) sets: Vec<Vec<Comparator>>,
}

impl SemverRange {
  pub(super) fn parse(input: &str) -> Option<Self> {
    let normalized = split_ecmascript_whitespace(input).collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
      return Some(Self {
        sets: vec![vec![Comparator::any()]],
      });
    }
    let mut sets = Vec::new();
    for raw_part in normalized.split("||") {
      let stripped = strip_build_metadata(trim_ecmascript(raw_part));
      let part = trim_ecmascript(&stripped);
      if part.is_empty() {
        sets.push(vec![Comparator::any()]);
        continue;
      }
      if let Some((from_str, to_str)) = part.split_once(" - ") {
        sets.push(expand_hyphen(trim_ecmascript(from_str), trim_ecmascript(to_str))?);
        continue;
      }

      // Collapse whitespace between operators (`>= 0.26.0` -> `>=0.26.0`).
      let raw_tokens: Vec<&str> = split_ecmascript_whitespace(part).collect();
      let mut merged_tokens: Vec<String> = Vec::with_capacity(raw_tokens.len());
      let mut i = 0;
      while i < raw_tokens.len() {
        let tok = raw_tokens[i];
        if matches!(tok, ">=" | "<=" | ">" | "<" | "=" | "^" | "~" | "~>") {
          let next = raw_tokens.get(i + 1)?;
          merged_tokens.push(format!("{tok}{next}"));
          i += 2;
        } else {
          merged_tokens.push(tok.to_owned());
          i += 1;
        }
      }

      let mut comps = Vec::new();
      for token in &merged_tokens {
        if let Some(rest) = token.strip_prefix('^') {
          comps.extend(expand_caret(&parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix("~>").or_else(|| token.strip_prefix('~')) {
          comps.extend(expand_tilde(&parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix(">=") {
          comps.extend(expand_x_range(Some(RangeOp::Gte), &parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix("<=") {
          comps.extend(expand_x_range(Some(RangeOp::Lte), &parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix('>') {
          comps.extend(expand_x_range(Some(RangeOp::Gt), &parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix('<') {
          comps.extend(expand_x_range(Some(RangeOp::Lt), &parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix('=') {
          comps.extend(expand_x_range(Some(RangeOp::Eq), &parse_partial_version(rest)?)?);
        } else {
          comps.extend(expand_x_range(None, &parse_partial_version(token)?)?);
        }
      }
      if comps.is_empty() {
        return None;
      }
      sets.push(comps);
    }
    if sets.len() > 1 {
      let filtered: Vec<Vec<Comparator>> = sets
        .iter()
        .filter(|s| !s.iter().any(Comparator::is_empty_set))
        .cloned()
        .collect();
      if !filtered.is_empty() {
        sets = filtered;
      } else {
        sets.truncate(1);
      }
    }
    Some(Self { sets })
  }

  pub(super) fn satisfies_include_prerelease(&self, candidate: &Semver) -> bool {
    self
      .sets
      .iter()
      .any(|conjunction| conjunction.iter().all(|c| c.matches(candidate)))
  }
}
