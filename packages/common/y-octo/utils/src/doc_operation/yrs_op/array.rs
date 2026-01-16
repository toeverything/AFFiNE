use phf::phf_map;

use super::*;

fn insert_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let array = match nest_input {
    YrsNestType::ArrayType(array) => array,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();
  let len = array.len(&trx);
  let index = random_pick_num(len, &params.insert_pos);
  array.insert(&mut trx, index, params.value);
}

fn delete_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let array = match nest_input {
    YrsNestType::ArrayType(array) => array,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();
  let len = array.len(&trx);
  if len >= 1 {
    let index = random_pick_num(len - 1, &params.insert_pos);
    array.remove(&mut trx, index);
  }
}

fn clear_op(doc: &yrs::Doc, nest_input: &YrsNestType, _params: CRDTParam) {
  let array = match nest_input {
    YrsNestType::ArrayType(array) => array,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();
  let len = array.len(&trx);
  for _ in 0..len {
    array.remove(&mut trx, 0);
  }
}

pub static ARRAY_OPS: TestOps = phf_map! {
    "insert" => insert_op,
    "delete" => delete_op,
    "clear" => clear_op,
};

pub fn yrs_create_array_from_nest_type(
  doc: &yrs::Doc,
  current: &mut YrsNestType,
  insert_pos: &InsertPos,
  key: String,
) -> Option<ArrayRef> {
  let cal_index = |len: u32| -> u32 {
    match insert_pos {
      InsertPos::BEGIN => 0,
      InsertPos::MID => len / 2,
      InsertPos::END => len,
    }
  };
  let mut trx = doc.transact_mut();
  let array_prelim = ArrayPrelim::default();
  match current {
    YrsNestType::ArrayType(array) => {
      let index = cal_index(array.len(&trx));
      Some(array.insert(&mut trx, index, array_prelim))
    }
    YrsNestType::MapType(map) => Some(map.insert(&mut trx, key, array_prelim)),
    YrsNestType::TextType(text) => {
      let str = text.get_string(&trx);
      let len = str.chars().fold(0, |acc, _| acc + 1);
      let index = random_pick_num(len, insert_pos) as usize;
      let byte_start_offset = str.chars().take(index).fold(0, |acc, ch| acc + ch.len_utf8());

      Some(text.insert_embed(&mut trx, byte_start_offset as u32, array_prelim))
    }
    YrsNestType::XMLTextType(xml_text) => {
      let str = xml_text.get_string(&trx);
      let len = str.chars().fold(0, |acc, _| acc + 1);
      let index = random_pick_num(len, insert_pos) as usize;
      let byte_start_offset = str.chars().take(index).fold(0, |acc, ch| acc + ch.len_utf8());

      Some(xml_text.insert_embed(&mut trx, byte_start_offset as u32, array_prelim))
    }
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use yrs::Doc;

  use super::*;

  #[test]
  fn test_gen_array_ref_ops() {
    let doc = Doc::new();
    let array_ref = doc.get_or_insert_array("test_array");

    let ops_registry = OpsRegistry::new();

    let mut params = CRDTParam {
      op_type: OpType::CreateCRDTNestType,
      new_nest_type: CRDTNestType::Array,
      manipulate_source: ManipulateSource::NewNestTypeFromYDocRoot,
      insert_pos: InsertPos::BEGIN,
      key: String::from("test_key"),
      value: String::from("test_value"),
      nest_data_op_type: NestDataOpType::Insert,
    };

    ops_registry.operate_yrs_nest_type(&doc, YrsNestType::ArrayType(array_ref.clone()), params.clone());
    assert_eq!(array_ref.len(&doc.transact()), 1);
    params.nest_data_op_type = NestDataOpType::Delete;
    ops_registry.operate_yrs_nest_type(&doc, YrsNestType::ArrayType(array_ref.clone()), params.clone());
    assert_eq!(array_ref.len(&doc.transact()), 0);

    params.nest_data_op_type = NestDataOpType::Clear;
    ops_registry.operate_yrs_nest_type(&doc, YrsNestType::ArrayType(array_ref.clone()), params.clone());
    assert_eq!(array_ref.len(&doc.transact()), 0);
  }

  #[test]
  fn test_yrs_create_array_from_nest_type() {
    let doc = Doc::new();
    let array_ref = doc.get_or_insert_array("test_array");
    let key = String::from("test_key");

    let new_array_ref = yrs_create_array_from_nest_type(
      &doc,
      &mut YrsNestType::ArrayType(array_ref.clone()),
      &InsertPos::BEGIN,
      key.clone(),
    );
    assert!(new_array_ref.is_some());

    let map_ref = doc.get_or_insert_map("test_map");
    let new_array_ref = yrs_create_array_from_nest_type(
      &doc,
      &mut YrsNestType::MapType(map_ref.clone()),
      &InsertPos::BEGIN,
      key.clone(),
    );
    assert!(new_array_ref.is_some());

    let text_ref = doc.get_or_insert_text("test_text");
    let new_array_ref = yrs_create_array_from_nest_type(
      &doc,
      &mut YrsNestType::TextType(text_ref.clone()),
      &InsertPos::BEGIN,
      key.clone(),
    );
    assert!(new_array_ref.is_some());
  }
}
