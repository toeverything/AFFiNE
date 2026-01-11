use phf::phf_map;

use super::*;

fn insert_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let xml_text = match nest_input {
    YrsNestType::XMLTextType(xml_text) => xml_text,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();

  let str = xml_text.get_string(&trx);
  let len = str.chars().fold(0, |acc, _| acc + 1);
  let index = random_pick_num(len, &params.insert_pos) as usize;
  let byte_start_offset = str.chars().take(index).fold(0, |acc, ch| acc + ch.len_utf8());

  xml_text.insert(&mut trx, byte_start_offset as u32, &params.value);
}

fn remove_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let xml_text = match nest_input {
    YrsNestType::XMLTextType(xml_text) => xml_text,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();

  let str = xml_text.get_string(&trx);
  let len = str.chars().fold(0, |acc, _| acc + 1);
  if len < 1 {
    return;
  }
  let index = random_pick_num(len - 1, &params.insert_pos) as usize;
  let byte_start_offset = str.chars().take(index).fold(0, |acc, ch| acc + ch.len_utf8());

  let char_byte_len = str.chars().nth(index).unwrap().len_utf8();
  xml_text.remove_range(&mut trx, byte_start_offset as u32, char_byte_len as u32);
}

fn clear_op(doc: &yrs::Doc, nest_input: &YrsNestType, _params: CRDTParam) {
  let xml_text = match nest_input {
    YrsNestType::XMLTextType(xml_text) => xml_text,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();

  let str = xml_text.get_string(&trx);
  let byte_len = str.chars().fold(0, |acc, ch| acc + ch.len_utf8());

  xml_text.remove_range(&mut trx, 0, byte_len as u32);
}

pub static XML_TEXT_OPS: TestOps = phf_map! {
    "insert" => insert_op,
    "delete" => remove_op,
    "clear" => clear_op,
};
