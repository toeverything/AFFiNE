#[cfg(test)]
mod tests {
  use y_octo::Doc;
  use yrs::{Map, Transact};

  #[test]
  fn test_basic_yrs_binary_compatibility() {
    let yrs_doc = yrs::Doc::new();

    let map = yrs_doc.get_or_insert_map("abc");
    let mut trx = yrs_doc.transact_mut();
    map.insert(&mut trx, "a", 1);

    let binary_from_yrs = trx.encode_update_v1();

    let doc = Doc::try_from_binary_v1(&binary_from_yrs).unwrap();
    let binary = doc.encode_update_v1().unwrap();

    assert_eq!(binary_from_yrs, binary);
  }
}
