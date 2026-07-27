//! Self-contained port of `fractional-indexing@3.2.0` (David Greenspan's reference impl),
//! the exact scheme AFFiNE surface elements use for their `index` field (base-62 alphabet,
//! `INITIAL_INDEX == "a0"`). Pinned in `yarn.lock` and used by
//! `LayerManager.generateIndex()` -> `generateKeyBetween` (blocksuite/framework/std gfx/layer.ts).
//!
//! This is the RAW `generateKeyBetween` / `generateNKeysBetween`, NOT the jittered V2 wrapper
//! `generateFractionalIndexingKeyBetween` (which appends a random postfix and is used elsewhere
//! for block/doc ordering). The unit tests below assert the canonical 3.2.0 vectors plus the
//! repo's own spec-file `no postfix` cases, byte-for-byte.

use std::fmt;

const BASE_62_DIGITS: &str = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/// "A" followed by exactly 26 "0" (length 27, == get_integer_length('A')). Sentinel low bound.
const SMALLEST_INTEGER: &str = "A00000000000000000000000000";
const ZERO: char = '0';

#[derive(Debug, PartialEq, Eq)]
pub struct FracIndexError(pub String);

impl fmt::Display for FracIndexError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "fractional-index error: {}", self.0)
    }
}
impl std::error::Error for FracIndexError {}

fn err<T>(msg: impl Into<String>) -> Result<T, FracIndexError> {
    Err(FracIndexError(msg.into()))
}

/// Index of a base-62 digit char in `BASE_62_DIGITS`, or `None` if not a valid digit.
fn digit_index(c: char) -> Option<usize> {
    BASE_62_DIGITS.find(c)
}
fn digit_char(i: usize) -> char {
    BASE_62_DIGITS.as_bytes()[i] as char
}
fn base() -> usize {
    BASE_62_DIGITS.len()
}

/// Length of the integer part given its first ("magnitude") char.
/// lowercase `a..z` => positive, length 2..27; uppercase `A..Z` => negative, length 27..2.
fn get_integer_length(head: char) -> Result<usize, FracIndexError> {
    if head.is_ascii_lowercase() {
        Ok((head as usize - 'a' as usize) + 2)
    } else if head.is_ascii_uppercase() {
        Ok(('Z' as usize - head as usize) + 2)
    } else {
        err(format!("invalid order key head: {head}"))
    }
}

fn validate_integer(int: &str) -> Result<(), FracIndexError> {
    let first = int
        .chars()
        .next()
        .ok_or_else(|| FracIndexError("empty integer".into()))?;
    let expected = get_integer_length(first)?;
    if int.chars().count() != expected {
        return err(format!("invalid integer part of order key: {int}"));
    }
    Ok(())
}

fn get_integer_part(key: &str) -> Result<String, FracIndexError> {
    let head = key.chars().next().ok_or_else(|| FracIndexError("empty key".into()))?;
    let integer_part_length = get_integer_length(head)?;
    if integer_part_length > key.chars().count() {
        return err(format!("invalid order key: {key}"));
    }
    Ok(key.chars().take(integer_part_length).collect())
}

fn validate_order_key(key: &str) -> Result<(), FracIndexError> {
    if key == SMALLEST_INTEGER {
        return err(format!("invalid order key: {key}"));
    }
    let i = get_integer_part(key)?;
    let fraction: String = key.chars().skip(i.chars().count()).collect();
    if fraction.ends_with(ZERO) {
        return err(format!("invalid order key: {key}"));
    }
    Ok(())
}

/// Add 1 to the integer string in base 62; may grow/shrink the magnitude. `None` == overflow.
fn increment_integer(x: &str) -> Result<Option<String>, FracIndexError> {
    validate_integer(x)?;
    let mut all: Vec<char> = x.chars().collect();
    let head = all[0];
    let mut digs: Vec<char> = all.split_off(1);
    let mut carry = true;
    let mut i = digs.len();
    while carry && i > 0 {
        i -= 1;
        let d = digit_index(digs[i]).ok_or_else(|| FracIndexError("bad digit".into()))? + 1;
        if d == base() {
            digs[i] = ZERO;
        } else {
            digs[i] = digit_char(d);
            carry = false;
        }
    }
    if carry {
        if head == 'Z' {
            return Ok(Some("a0".to_string()));
        }
        if head == 'z' {
            return Ok(None);
        }
        let new_head = (head as u8 + 1) as char;
        let new_digs: String = if new_head > 'a' {
            let mut s: String = digs.iter().collect();
            s.push(ZERO);
            s
        } else {
            digs.iter().take(digs.len().saturating_sub(1)).collect()
        };
        let mut out = String::new();
        out.push(new_head);
        out.push_str(&new_digs);
        Ok(Some(out))
    } else {
        let mut out = String::new();
        out.push(head);
        out.extend(digs.iter());
        Ok(Some(out))
    }
}

/// Subtract 1 from the integer string in base 62; may grow/shrink the magnitude. `None` == underflow.
fn decrement_integer(x: &str) -> Result<Option<String>, FracIndexError> {
    validate_integer(x)?;
    let mut all: Vec<char> = x.chars().collect();
    let head = all[0];
    let mut digs: Vec<char> = all.split_off(1);
    let mut borrow = true;
    let mut i = digs.len();
    while borrow && i > 0 {
        i -= 1;
        match digit_index(digs[i]) {
            Some(0) => digs[i] = digit_char(base() - 1),
            Some(d) => {
                digs[i] = digit_char(d - 1);
                borrow = false;
            }
            None => return err("bad digit"),
        }
    }
    if borrow {
        if head == 'a' {
            return Ok(Some(format!("Z{}", digit_char(base() - 1))));
        }
        if head == 'A' {
            return Ok(None);
        }
        let new_head = (head as u8 - 1) as char;
        let new_digs: String = if new_head < 'Z' {
            let mut s: String = digs.iter().collect();
            s.push(digit_char(base() - 1));
            s
        } else {
            digs.iter().take(digs.len().saturating_sub(1)).collect()
        };
        let mut out = String::new();
        out.push(new_head);
        out.push_str(&new_digs);
        Ok(Some(out))
    } else {
        let mut out = String::new();
        out.push(head);
        out.extend(digs.iter());
        Ok(Some(out))
    }
}

/// Midpoint of two fractional strings (no integer part). `a < b` lexicographically, or `b == ""`
/// meaning an open upper bound. Returns `m` with `a < m < b`.
fn midpoint(a: &str, b: &str) -> Result<String, FracIndexError> {
    let n = base();
    if !b.is_empty() {
        if a >= b {
            return err(format!("{a} >= {b}"));
        }
        // Walk the common prefix.
        let a_chars: Vec<char> = a.chars().collect();
        let b_chars: Vec<char> = b.chars().collect();
        let mut i = 0usize;
        loop {
            let ca = a_chars.get(i).copied().unwrap_or(ZERO);
            let cb = b_chars[i];
            if ca == cb {
                i += 1;
                continue;
            }
            break;
        }
        if i > 0 {
            let prefix: String = b_chars[..i].iter().collect();
            let a_rest: String = a_chars.iter().skip(i).collect();
            let b_rest: String = b_chars.iter().skip(i).collect();
            return Ok(format!("{prefix}{}", midpoint(&a_rest, &b_rest)?));
        }
        // Digits differ at position 0.
        let digit_a = a_chars.first().map(|&c| digit_index(c).unwrap()).unwrap_or(0);
        let digit_b = digit_index(b_chars[0]).unwrap();
        if digit_b - digit_a > 1 {
            let mid_digit = round_half_up(digit_a + digit_b, 2);
            Ok(digit_char(mid_digit).to_string())
        } else {
            // b's first digit is one greater than a's.
            if b_chars.len() > 1 {
                Ok(b_chars[..1].iter().collect())
            } else {
                // b has no more digits; build on a's remainder.
                let a_rest: String = a_chars.iter().skip(1).collect();
                Ok(format!("{}{}", digit_char(digit_a), midpoint(&a_rest, "")?))
            }
        }
    } else {
        // b is open: midpoint between a and the implicit "all-max".
        let a_chars: Vec<char> = a.chars().collect();
        let digit_a = a_chars.first().map(|&c| digit_index(c).unwrap()).unwrap_or(0);
        if digit_a + 1 < n {
            let mid_digit = round_half_up(digit_a + n, 2);
            Ok(digit_char(mid_digit).to_string())
        } else {
            let a_rest: String = a_chars.iter().skip(1).collect();
            Ok(format!("{}{}", digit_char(digit_a), midpoint(&a_rest, "")?))
        }
    }
}

/// `Math.round(num / den)` for non-negative integers — round-half-up, matching JS `Math.round`.
fn round_half_up(num: usize, den: usize) -> usize {
    (num + den / 2) / den
}

/// Generate a key strictly between `a` and `b`. `a < b`. Either may be `None` (open bound).
pub fn generate_key_between(a: Option<&str>, b: Option<&str>) -> Result<String, FracIndexError> {
    if let Some(a) = a {
        validate_order_key(a)?;
    }
    if let Some(b) = b {
        validate_order_key(b)?;
    }
    if let (Some(a), Some(b)) = (a, b)
        && a >= b
    {
        return err(format!("{a} >= {b}"));
    }
    match (a, b) {
        (None, None) => Ok("a0".to_string()),
        (None, Some(b)) => {
            let ib = get_integer_part(b)?;
            let fb: String = b.chars().skip(ib.chars().count()).collect();
            if ib == SMALLEST_INTEGER {
                return Ok(format!("{ib}{}", midpoint("", &fb)?));
            }
            if ib.as_str() < b {
                Ok(ib)
            } else {
                decrement_integer(&ib)?.ok_or_else(|| FracIndexError("cannot decrement any more".into()))
            }
        }
        (Some(a), None) => {
            let ia = get_integer_part(a)?;
            let fa: String = a.chars().skip(ia.chars().count()).collect();
            match increment_integer(&ia)? {
                None => Ok(format!("{ia}{}", midpoint(&fa, "")?)),
                Some(i) => Ok(i),
            }
        }
        (Some(a), Some(b)) => {
            let ia = get_integer_part(a)?;
            let fa: String = a.chars().skip(ia.chars().count()).collect();
            let ib = get_integer_part(b)?;
            let fb: String = b.chars().skip(ib.chars().count()).collect();
            if ia == ib {
                return Ok(format!("{ia}{}", midpoint(&fa, &fb)?));
            }
            let i = increment_integer(&ia)?.ok_or_else(|| FracIndexError("cannot increment any more".into()))?;
            if i.as_str() < b {
                Ok(i)
            } else {
                Ok(format!("{ia}{}", midpoint(&fa, "")?))
            }
        }
    }
}

/// Generate `n` keys strictly between `a` and `b` (exclusive), recursively bisected — matching
/// `generateNKeysBetween` exactly. Not used by the single-element CLI paths today, but part of
/// the faithful port and exercised by the unit tests (multi-element batches / mindmap ordering).
#[allow(dead_code)]
pub fn generate_n_keys_between(a: Option<&str>, b: Option<&str>, n: usize) -> Result<Vec<String>, FracIndexError> {
    if n == 0 {
        return Ok(vec![]);
    }
    if n == 1 {
        return Ok(vec![generate_key_between(a, b)?]);
    }
    if b.is_none() {
        let mut c = generate_key_between(a, b)?;
        let mut result = vec![c.clone()];
        for _ in 0..(n - 1) {
            c = generate_key_between(Some(&c), b)?;
            result.push(c.clone());
        }
        return Ok(result);
    }
    if a.is_none() {
        let mut c = generate_key_between(a, b)?;
        let mut result = vec![c.clone()];
        for _ in 0..(n - 1) {
            c = generate_key_between(a, Some(&c))?;
            result.push(c.clone());
        }
        result.reverse();
        return Ok(result);
    }
    let mid = n / 2;
    let c = generate_key_between(a, b)?;
    let mut left = generate_n_keys_between(a, Some(&c), mid)?;
    let right = generate_n_keys_between(Some(&c), b, n - mid - 1)?;
    left.push(c);
    left.extend(right);
    Ok(left)
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- canonical 3.2.0 generateKeyBetween vectors (byte-equality) ---
    #[test]
    fn initial_index_is_a0() {
        assert_eq!(generate_key_between(None, None).unwrap(), "a0");
    }

    #[test]
    fn append_increments() {
        assert_eq!(generate_key_between(Some("a0"), None).unwrap(), "a1");
        assert_eq!(generate_key_between(Some("a1"), None).unwrap(), "a2");
    }

    #[test]
    fn prepend_decrements() {
        assert_eq!(generate_key_between(None, Some("a0")).unwrap(), "Zz");
        assert_eq!(generate_key_between(None, Some("a1")).unwrap(), "a0");
        assert_eq!(generate_key_between(None, Some("Zz")).unwrap(), "Zy");
    }

    #[test]
    fn between_consecutive_integers() {
        assert_eq!(generate_key_between(Some("a0"), Some("a1")).unwrap(), "a0V");
        assert_eq!(generate_key_between(Some("Zz"), Some("a0")).unwrap(), "ZzV");
    }

    #[test]
    fn between_a0_and_a01() {
        assert_eq!(generate_key_between(Some("a0"), Some("a01")).unwrap(), "a00V");
    }

    #[test]
    fn magnitude_growth() {
        assert_eq!(generate_key_between(Some("az"), None).unwrap(), "b00");
        assert_eq!(generate_key_between(Some("b00"), None).unwrap(), "b01");
    }

    // --- repo spec-file "no postfix" cases (startsWith == byte-prefix of RAW output) ---
    #[test]
    fn spec_no_postfix_cases() {
        assert!(generate_key_between(Some("a0"), None).unwrap().starts_with("a1"));
        assert!(generate_key_between(Some("a01"), None).unwrap().starts_with("a1"));
        assert!(generate_key_between(Some("a0001"), None).unwrap().starts_with("a1"));
        assert!(generate_key_between(None, Some("a0")).unwrap().starts_with("Zz"));
        assert!(
            generate_key_between(Some("a0"), Some("a01"))
                .unwrap()
                .starts_with("a00V")
        );
    }

    #[test]
    fn integer_part_of_a01_increments_to_a1() {
        // a01 has integer part "a0"; appending past it yields "a1".
        assert_eq!(generate_key_between(Some("a01"), None).unwrap(), "a1");
        assert_eq!(generate_key_between(Some("a0001"), None).unwrap(), "a1");
    }

    // --- generateNKeysBetween canonical vectors ---
    #[test]
    fn n_keys_open_both() {
        assert_eq!(generate_n_keys_between(None, None, 3).unwrap(), vec!["a0", "a1", "a2"]);
    }

    #[test]
    fn n_keys_between_bounds() {
        assert_eq!(generate_n_keys_between(Some("a0"), Some("a1"), 1).unwrap(), vec!["a0V"]);
        assert_eq!(
            generate_n_keys_between(Some("a0"), Some("a1"), 2).unwrap(),
            vec!["a0G", "a0V"]
        );
    }

    // --- ordering invariant: a < gen(a,b) < b as plain string comparison ---
    #[test]
    fn ordering_invariant_chain() {
        for _ in 0..50 {
            let mut a = generate_key_between(None, None).unwrap();
            let mut b = generate_key_between(Some(&a), None).unwrap();
            if a > b {
                std::mem::swap(&mut a, &mut b);
            }
            let c = generate_key_between(Some(&a), Some(&b)).unwrap();
            let d = generate_key_between(Some(&c), Some(&b)).unwrap();
            assert!(a < c, "{a} < {c}");
            assert!(c < d, "{c} < {d}");
            assert!(d < b, "{d} < {b}");
        }
    }

    #[test]
    fn monotone_append_sequence_sorts_ascending() {
        let mut prev = generate_key_between(None, None).unwrap();
        let mut seq = vec![prev.clone()];
        for _ in 0..30 {
            prev = generate_key_between(Some(&prev), None).unwrap();
            seq.push(prev.clone());
        }
        let mut sorted = seq.clone();
        sorted.sort();
        assert_eq!(seq, sorted, "append sequence must be strictly ascending");
    }

    // --- error paths ---
    #[test]
    fn errors_when_a_ge_b() {
        assert!(generate_key_between(Some("a1"), Some("a0")).is_err());
        assert!(generate_key_between(Some("a0"), Some("a0")).is_err());
    }

    #[test]
    fn errors_on_smallest_integer_bound() {
        assert!(generate_key_between(None, Some(SMALLEST_INTEGER)).is_err());
    }
}
