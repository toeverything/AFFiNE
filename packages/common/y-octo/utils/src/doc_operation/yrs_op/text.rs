use phf::phf_map;

use super::*;

fn insert_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let text = match nest_input {
    YrsNestType::TextType(text) => text,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();

  let str = text.get_string(&trx);
  let len = str.chars().fold(0, |acc, _| acc + 1);
  let index = random_pick_num(len, &params.insert_pos) as usize;
  let byte_start_offset = str.chars().take(index).fold(0, |acc, ch| acc + ch.len_utf8());

  text.insert(&mut trx, byte_start_offset as u32, &params.value);
}

fn remove_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let text = match nest_input {
    YrsNestType::TextType(text) => text,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();

  let str = text.get_string(&trx);
  let len = str.chars().fold(0, |acc, _| acc + 1);
  if len < 1 {
    return;
  }
  let index = random_pick_num(len - 1, &params.insert_pos) as usize;
  let byte_start_offset = str.chars().take(index).fold(0, |acc, ch| acc + ch.len_utf8());

  let char_byte_len = str.chars().nth(index).unwrap().len_utf8();
  text.remove_range(&mut trx, byte_start_offset as u32, char_byte_len as u32);
}

fn clear_op(doc: &yrs::Doc, nest_input: &YrsNestType, _params: CRDTParam) {
  let text = match nest_input {
    YrsNestType::TextType(text) => text,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();

  let str = text.get_string(&trx);
  let byte_len = str.chars().fold(0, |acc, ch| acc + ch.len_utf8());

  text.remove_range(&mut trx, 0, byte_len as u32);
}

pub static TEXT_OPS: TestOps = phf_map! {
    "insert" => insert_op,
    "delete" => remove_op,
    "clear" => clear_op,
};

pub fn yrs_create_text_from_nest_type(
  doc: &yrs::Doc,
  current: &mut YrsNestType,
  insert_pos: &InsertPos,
  key: String,
) -> Option<TextRef> {
  let cal_index_closure = |len: u32| -> u32 { random_pick_num(len, insert_pos) };
  let mut trx = doc.transact_mut();
  let text_prelim = TextPrelim::new("");
  match current {
    YrsNestType::ArrayType(array) => {
      let index = cal_index_closure(array.len(&trx));
      Some(array.insert(&mut trx, index, text_prelim))
    }
    YrsNestType::MapType(map) => Some(map.insert(&mut trx, key, text_prelim)),
    YrsNestType::TextType(text) => {
      let str = text.get_string(&trx);
      let len = str.chars().fold(0, |acc, _| acc + 1);
      let index = random_pick_num(len, insert_pos) as usize;
      let byte_start_offset = str.chars().take(index).fold(0, |acc, ch| acc + ch.len_utf8());

      Some(text.insert_embed(&mut trx, byte_start_offset as u32, text_prelim))
    }
    YrsNestType::XMLTextType(xml_text) => {
      let str = xml_text.get_string(&trx);
      let len = str.chars().fold(0, |acc, _| acc + 1);
      let index = random_pick_num(len, insert_pos) as usize;
      let byte_start_offset = str.chars().take(index).fold(0, |acc, ch| acc + ch.len_utf8());

      Some(xml_text.insert_embed(&mut trx, byte_start_offset as u32, text_prelim))
    }
    _ => None,
  }
}
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_gen_array_ref_ops() {
    let doc = Doc::new();
    let text_ref = doc.get_or_insert_text("test_text");

    let ops_registry = OpsRegistry::new();

    let mut params = CRDTParam {
      op_type: OpType::CreateCRDTNestType,
      new_nest_type: CRDTNestType::Text,
      manipulate_source: ManipulateSource::NewNestTypeFromYDocRoot,
      insert_pos: InsertPos::BEGIN,
      key: String::from("test_key"),
      value: String::from("test_value"),
      nest_data_op_type: NestDataOpType::Insert,
    };

    ops_registry.operate_yrs_nest_type(&doc, YrsNestType::TextType(text_ref.clone()), params.clone());
    assert_eq!(text_ref.len(&doc.transact()), 10);
    params.nest_data_op_type = NestDataOpType::Delete;
    ops_registry.operate_yrs_nest_type(&doc, YrsNestType::TextType(text_ref.clone()), params.clone());
    assert_eq!(text_ref.len(&doc.transact()), 9);

    params.nest_data_op_type = NestDataOpType::Clear;
    ops_registry.operate_yrs_nest_type(&doc, YrsNestType::TextType(text_ref.clone()), params.clone());
    assert_eq!(text_ref.len(&doc.transact()), 0);
  }

  #[test]
  fn test_yrs_create_array_from_nest_type() {
    let doc = Doc::new();
    let array_ref = doc.get_or_insert_array("test_array");
    let key = String::from("test_key");

    let next_text_ref = yrs_create_text_from_nest_type(
      &doc,
      &mut YrsNestType::ArrayType(array_ref.clone()),
      &InsertPos::BEGIN,
      key.clone(),
    );
    assert!(next_text_ref.is_some());

    let map_ref = doc.get_or_insert_map("test_map");
    let next_text_ref = yrs_create_text_from_nest_type(
      &doc,
      &mut YrsNestType::MapType(map_ref.clone()),
      &InsertPos::BEGIN,
      key.clone(),
    );
    assert!(next_text_ref.is_some());

    let text_ref = doc.get_or_insert_text("test_text");
    let next_text_ref = yrs_create_text_from_nest_type(
      &doc,
      &mut YrsNestType::TextType(text_ref.clone()),
      &InsertPos::BEGIN,
      key.clone(),
    );
    assert!(next_text_ref.is_some());
  }
}
