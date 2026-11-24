//! Exact `fractional-indexing@3.2.0` (base-62) key generation compatible with BlockSuite.
//!
//! Integer keys start with a head character encoding their digit count:
//! - `'a'`..=`'z'` have `1..=26` base-62 digits (`"a0"`..`"a9"`, `"aA"`..`"az"`, `"b00"`..`"bzz"`).
//! - `'Z'`..=`'A'` have `1..=26` negative base-62 digits (`"Zz"`..`"Z0"`, `"Yzz"`..`"Y00"`).
//! Note that `"b0"` is invalid because `'b'` requires 2 integer digits (`"b00"`..`"bzz"`).

const BASE_62_DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SMALLEST_INTEGER: &str = "A00000000000000000000000000";
const INTEGER_ZERO: &str = "a0";

fn digit_index(ch: u8) -> Option<usize> {
    BASE_62_DIGITS.iter().position(|&b| b == ch)
}

fn integer_length(head: u8) -> Result<usize, String> {
    if head.is_ascii_lowercase() {
        Ok((head - b'a') as usize + 2)
    } else if head.is_ascii_uppercase() {
        Ok((b'Z' - head) as usize + 2)
    } else {
        Err(format!("invalid order key head: {:?}", head as char))
    }
}

fn validate_integer(int: &str) -> Result<(), String> {
    let bytes = int.as_bytes();
    if bytes.is_empty() {
        return Err("empty integer part".into());
    }
    let expected = integer_length(bytes[0])?;
    if bytes.len() != expected {
        return Err(format!("invalid integer part of order key: {int}"));
    }
    for &b in &bytes[1..] {
        if digit_index(b).is_none() {
            return Err(format!("invalid base-62 digit in order key: {int}"));
        }
    }
    Ok(())
}

fn get_integer_part(key: &str) -> Result<&str, String> {
    let bytes = key.as_bytes();
    if bytes.is_empty() {
        return Err("empty order key".into());
    }
    let len = integer_length(bytes[0])?;
    if len > bytes.len() {
        return Err(format!("invalid order key: {key}"));
    }
    let int = &key[..len];
    validate_integer(int)?;
    Ok(int)
}

/// Validate that `key` is a legal `fractional-indexing@3.2.0` base-62 order key.
pub fn validate_order_key(key: &str) -> Result<(), String> {
    if key == SMALLEST_INTEGER {
        return Err(format!("invalid order key: {key}"));
    }
    let int = get_integer_part(key)?;
    let frac = &key[int.len()..];
    for &b in frac.as_bytes() {
        if digit_index(b).is_none() {
            return Err(format!("invalid fractional digit in order key: {key}"));
        }
    }
    if frac.ends_with(BASE_62_DIGITS[0] as char) {
        return Err(format!("invalid order key trailing zero: {key}"));
    }
    Ok(())
}

fn increment_integer(x: &str) -> Result<Option<String>, String> {
    validate_integer(x)?;
    let bytes = x.as_bytes();
    let head = bytes[0];
    let mut digs = bytes[1..].to_vec();
    let mut carry = true;
    for d in digs.iter_mut().rev() {
        if !carry {
            break;
        }
        let idx = digit_index(*d).unwrap() + 1;
        if idx == BASE_62_DIGITS.len() {
            *d = BASE_62_DIGITS[0];
        } else {
            *d = BASE_62_DIGITS[idx];
            carry = false;
        }
    }
    if carry {
        if head == b'Z' {
            return Ok(Some(INTEGER_ZERO.to_string()));
        }
        if head == b'z' {
            return Ok(None);
        }
        let next_head = head + 1;
        if next_head > b'a' {
            digs.push(BASE_62_DIGITS[0]);
        } else {
            digs.pop();
        }
        let mut out = String::with_capacity(1 + digs.len());
        out.push(next_head as char);
        out.push_str(std::str::from_utf8(&digs).unwrap());
        Ok(Some(out))
    } else {
        let mut out = String::with_capacity(1 + digs.len());
        out.push(head as char);
        out.push_str(std::str::from_utf8(&digs).unwrap());
        Ok(Some(out))
    }
}

fn decrement_integer(x: &str) -> Result<Option<String>, String> {
    validate_integer(x)?;
    let bytes = x.as_bytes();
    let head = bytes[0];
    let mut digs = bytes[1..].to_vec();
    let mut borrow = true;
    for d in digs.iter_mut().rev() {
        if !borrow {
            break;
        }
        let idx = digit_index(*d).unwrap();
        if idx == 0 {
            *d = *BASE_62_DIGITS.last().unwrap();
        } else {
            *d = BASE_62_DIGITS[idx - 1];
            borrow = false;
        }
    }
    if borrow {
        if head == b'a' {
            return Ok(Some(format!(
                "Z{}",
                *BASE_62_DIGITS.last().unwrap() as char
            )));
        }
        if head == b'A' {
            return Ok(None);
        }
        let prev_head = head - 1;
        if prev_head < b'Z' {
            digs.push(*BASE_62_DIGITS.last().unwrap());
        } else {
            digs.pop();
        }
        let mut out = String::with_capacity(1 + digs.len());
        out.push(prev_head as char);
        out.push_str(std::str::from_utf8(&digs).unwrap());
        Ok(Some(out))
    } else {
        let mut out = String::with_capacity(1 + digs.len());
        out.push(head as char);
        out.push_str(std::str::from_utf8(&digs).unwrap());
        Ok(Some(out))
    }
}

fn midpoint(a: &str, b: Option<&str>) -> Result<String, String> {
    let zero = BASE_62_DIGITS[0];
    if let Some(b) = b
        && a >= b
    {
        return Err(format!("{a} >= {b}"));
    }
    if a.ends_with(zero as char) || b.is_some_and(|b| b.ends_with(zero as char)) {
        return Err("trailing zero in midpoint".into());
    }
    if let Some(b) = b {
        let a_bytes = a.as_bytes();
        let b_bytes = b.as_bytes();
        let mut n = 0;
        while n < b_bytes.len() && a_bytes.get(n).copied().unwrap_or(zero) == b_bytes[n] {
            n += 1;
        }
        if n > 0 {
            let sub_a = if n < a.len() { &a[n..] } else { "" };
            return Ok(format!("{}{}", &b[..n], midpoint(sub_a, Some(&b[n..]))?));
        }
    }
    let digit_a = a
        .as_bytes()
        .first()
        .map_or(0, |&c| digit_index(c).unwrap_or(0));
    let digit_b = b
        .and_then(|s| s.as_bytes().first())
        .map_or(BASE_62_DIGITS.len(), |&c| digit_index(c).unwrap_or(0));
    if digit_b - digit_a > 1 {
        let mid = ((digit_a + digit_b) as f64 * 0.5).round() as usize;
        return Ok((BASE_62_DIGITS[mid] as char).to_string());
    }
    if let Some(b) = b
        && b.len() > 1
    {
        return Ok(b[..1].to_string());
    }
    let sub_a = if a.len() > 1 { &a[1..] } else { "" };
    Ok(format!(
        "{}{}",
        BASE_62_DIGITS[digit_a] as char,
        midpoint(sub_a, None)?
    ))
}

/// Generate a valid `fractional-indexing@3.2.0` base-62 key strictly between `a` and `b`.
pub fn generate_key_between(a: Option<&str>, b: Option<&str>) -> Result<String, String> {
    if let Some(a) = a {
        validate_order_key(a)?;
    }
    if let Some(b) = b {
        validate_order_key(b)?;
    }
    if let (Some(a), Some(b)) = (a, b)
        && a >= b
    {
        return Err(format!("{a} >= {b}"));
    }
    if a.is_none() {
        let Some(b) = b else {
            return Ok(INTEGER_ZERO.to_string());
        };
        let ib = get_integer_part(b)?;
        let fb = &b[ib.len()..];
        if ib == SMALLEST_INTEGER {
            return Ok(format!("{ib}{}", midpoint("", Some(fb))?));
        }
        if ib < b {
            return Ok(ib.to_string());
        }
        let res = decrement_integer(ib)?
            .ok_or_else(|| "cannot decrement smallest integer".to_string())?;
        return Ok(res);
    }
    let a = a.unwrap();
    if b.is_none() {
        let ia = get_integer_part(a)?;
        let fa = &a[ia.len()..];
        return match increment_integer(ia)? {
            Some(i) => Ok(i),
            None => Ok(format!("{ia}{}", midpoint(fa, None)?)),
        };
    }
    let b = b.unwrap();
    let ia = get_integer_part(a)?;
    let fa = &a[ia.len()..];
    let ib = get_integer_part(b)?;
    let fb = &b[ib.len()..];
    if ia == ib {
        return Ok(format!("{ia}{}", midpoint(fa, Some(fb))?));
    }
    let i = increment_integer(ia)?.ok_or_else(|| "cannot increment largest integer".to_string())?;
    if i.as_str() < b {
        Ok(i)
    } else {
        Ok(format!("{ia}{}", midpoint(fa, None)?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_fractional_indexing_3_2_0_vectors() {
        assert_eq!(generate_key_between(None, None).unwrap(), "a0");
        assert_eq!(generate_key_between(Some("a0"), None).unwrap(), "a1");
        assert_eq!(generate_key_between(Some("a9"), None).unwrap(), "aA");
        assert_eq!(generate_key_between(Some("aZ"), None).unwrap(), "aa");
        assert_eq!(generate_key_between(Some("az"), None).unwrap(), "b00");
        assert_eq!(generate_key_between(None, Some("a0")).unwrap(), "Zz");
        assert_eq!(generate_key_between(None, Some("Z0")).unwrap(), "Yzz");
        assert_eq!(generate_key_between(Some("a0"), Some("a1")).unwrap(), "a0V");
        assert_eq!(generate_key_between(Some("a0"), Some("a2")).unwrap(), "a1");
        assert_eq!(
            generate_key_between(Some("a0V"), Some("a1")).unwrap(),
            "a0l"
        );
        // "b0" is invalid in fractional-indexing@3.2.0 ('b' requires 2 base-62 digits).
        assert!(validate_order_key("b0").is_err());
        assert!(validate_order_key("b00").is_ok());
    }
}
