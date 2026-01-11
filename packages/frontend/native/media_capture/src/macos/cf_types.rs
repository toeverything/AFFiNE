use core_foundation::{
  array::CFArray,
  base::{CFType, TCFType},
  boolean::CFBoolean,
  dictionary::CFDictionary,
  string::CFString,
};

use crate::utils::cfstring_from_bytes_with_nul;

pub trait ToCoreFoundation {
  fn to_cf(&self) -> CFType;
}

impl ToCoreFoundation for CFString {
  fn to_cf(&self) -> CFType {
    self.as_CFType()
  }
}

impl ToCoreFoundation for &CFString {
  fn to_cf(&self) -> CFType {
    self.as_CFType()
  }
}

impl ToCoreFoundation for String {
  fn to_cf(&self) -> CFType {
    CFString::new(self).as_CFType()
  }
}

impl ToCoreFoundation for &str {
  fn to_cf(&self) -> CFType {
    CFString::new(self).as_CFType()
  }
}

impl ToCoreFoundation for bool {
  fn to_cf(&self) -> CFType {
    if *self {
      CFBoolean::true_value().as_CFType()
    } else {
      CFBoolean::false_value().as_CFType()
    }
  }
}

impl ToCoreFoundation for &[u8] {
  fn to_cf(&self) -> CFType {
    cfstring_from_bytes_with_nul(self).as_CFType()
  }
}

impl ToCoreFoundation for CFDictionary<CFType, CFType> {
  fn to_cf(&self) -> CFType {
    self.as_CFType()
  }
}

impl<T: ToCoreFoundation> ToCoreFoundation for Vec<T> {
  fn to_cf(&self) -> CFType {
    CFArray::from_CFTypes(self.iter().map(|t| t.to_cf()).collect::<Vec<_>>().as_slice()).as_CFType()
  }
}

pub struct CFDictionaryBuilder {
  pairs: Vec<(CFType, CFType)>,
}

impl CFDictionaryBuilder {
  pub fn new() -> Self {
    Self {
      pairs: Vec::with_capacity(16),
    }
  }

  pub fn add<K: ToCoreFoundation, V: ToCoreFoundation>(&mut self, key: K, value: V) -> &mut Self {
    self.pairs.push((key.to_cf(), value.to_cf()));
    self
  }

  pub fn build(self) -> CFDictionary<CFType, CFType> {
    CFDictionary::from_CFType_pairs(self.pairs.as_slice())
  }
}
