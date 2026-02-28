use std::convert::TryFrom;

use chrono::{DateTime, Duration, NaiveDateTime, Utc};
use rand::{
  distr::{Alphanumeric, Distribution},
  rng,
};
use sha3::{Digest, Sha3_256};

const SALT_LENGTH: usize = 16;

#[derive(Debug)]
pub struct Stamp {
  version: String,
  claim: u32,
  ts: String,
  resource: String,
  ext: String,
  rand: String,
  counter: String,
}

impl Stamp {
  fn check_expiration(&self) -> bool {
    NaiveDateTime::parse_from_str(&self.ts, "%Y%m%d%H%M%S")
      .ok()
      .map(|ts| DateTime::<Utc>::from_naive_utc_and_offset(ts, Utc))
      .and_then(|utc| {
        utc
          .checked_add_signed(Duration::minutes(5))
          .map(|utc| Utc::now() <= utc)
      })
      .unwrap_or(false)
  }

  pub fn check<S: AsRef<str>>(&self, bits: u32, resource: S) -> bool {
    if self.version == "1"
      && bits <= self.claim
      && self.check_expiration()
      && self.resource == resource.as_ref()
    {
      let hex_digits = ((self.claim as f32) / 4.).floor() as usize;

      // check challenge
      let mut hasher = Sha3_256::new();
      hasher.update(self.format().as_bytes());
      let result = format!("{:x}", hasher.finalize());
      result[..hex_digits] == String::from_utf8(vec![b'0'; hex_digits]).unwrap()
    } else {
      false
    }
  }

  pub fn format(&self) -> String {
    format!(
      "{}:{}:{}:{}:{}:{}:{}",
      self.version, self.claim, self.ts, self.resource, self.ext, self.rand, self.counter
    )
  }

  /// Mint a new hashcash stamp.
  pub fn mint(resource: String, bits: Option<u32>) -> Self {
    let version = "1";
    let now = Utc::now();
    let ts = now.format("%Y%m%d%H%M%S");
    let bits = bits.unwrap_or(20);
    let rand = String::from_iter(
      Alphanumeric
        .sample_iter(rng())
        .take(SALT_LENGTH)
        .map(char::from),
    );
    let challenge = format!("{}:{}:{}:{}:{}:{}", version, bits, ts, &resource, "", rand);

    Stamp {
      version: version.to_string(),
      claim: bits,
      ts: ts.to_string(),
      resource,
      ext: "".to_string(),
      rand,
      counter: {
        let mut hasher = Sha3_256::new();
        let mut counter = 0;
        let hex_digits = ((bits as f32) / 4.).ceil() as usize;
        let zeros = String::from_utf8(vec![b'0'; hex_digits]).unwrap();
        loop {
          hasher.update(format!("{}:{:x}", challenge, counter).as_bytes());
          let result = format!("{:x}", hasher.finalize_reset());
          if result[..hex_digits] == zeros {
            break format!("{:x}", counter);
          };
          counter += 1
        }
      },
    }
  }
}

impl TryFrom<&str> for Stamp {
  type Error = String;

  fn try_from(value: &str) -> Result<Self, Self::Error> {
    let stamp_vec = value.split(':').collect::<Vec<&str>>();
    if stamp_vec.len() != 7
      || stamp_vec
        .iter()
        .enumerate()
        .any(|(i, s)| i != 4 && s.is_empty())
    {
      return Err(format!(
        "Malformed stamp, expected 6 parts, got {}",
        stamp_vec.len()
      ));
    }
    Ok(Stamp {
      version: stamp_vec[0].to_string(),
      claim: stamp_vec[1]
        .parse()
        .map_err(|_| "Malformed stamp".to_string())?,
      ts: stamp_vec[2].to_string(),
      resource: stamp_vec[3].to_string(),
      ext: stamp_vec[4].to_string(),
      rand: stamp_vec[5].to_string(),
      counter: stamp_vec[6].to_string(),
    })
  }
}

#[cfg(test)]
mod tests {
  use rand::{distr::Alphanumeric, Rng};
  use rayon::prelude::*;

  use super::Stamp;

  #[test]
  fn test_mint() {
    {
      let response = Stamp::mint("test".into(), Some(20)).format();
      assert!(
        Stamp::try_from(response.as_str())
          .unwrap()
          .check(20, "test"),
        "should pass"
      );
    }

    {
      let response = Stamp::mint("test".into(), Some(19)).format();
      assert!(
        !Stamp::try_from(response.as_str())
          .unwrap()
          .check(20, "test"),
        "should fail with lower bits"
      );
    }
    {
      let response = Stamp::mint("test".into(), Some(20)).format();
      assert!(
        !Stamp::try_from(response.as_str())
          .unwrap()
          .check(20, "test2"),
        "should fail with different resource"
      );
    }
  }

  #[test]
  fn test_check_expiration() {
    let response = Stamp::mint("test".into(), Some(20));
    assert!(response.check_expiration());
  }

  #[test]
  fn test_format() {
    let response = Stamp::mint("test".into(), Some(20));
    assert_eq!(
      response.format(),
      format!(
        "1:20:{}:test::{}:{}",
        response.ts, response.rand, response.counter
      )
    );
  }

  #[test]
  fn test_fuzz() {
    (0..1000).into_par_iter().for_each(|_| {
      let bit = rand::random::<u32>() % 20 + 1;
      let resource = rand::rng()
        .sample_iter(&Alphanumeric)
        .take(7)
        .map(char::from)
        .collect::<String>();
      let response = Stamp::mint(resource.clone(), Some(bit)).format();
      assert!(
        Stamp::try_from(response.as_str())
          .unwrap()
          .check(bit, resource),
        "should pass"
      );
    });
  }
}
