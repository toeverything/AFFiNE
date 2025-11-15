use phf::phf_map;

use super::*;

fn insert_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let xml_element = match nest_input {
    YrsNestType::XMLElementType(xml_element) => xml_element,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();
  let len = xml_element.len(&trx);
  let index = random_pick_num(len, &params.insert_pos);
  xml_element.insert(&mut trx, index, XmlTextPrelim::new(params.value));
}

fn remove_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let xml_element = match nest_input {
    YrsNestType::XMLElementType(xml_element) => xml_element,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();
  let len = xml_element.len(&trx);
  if len >= 1 {
    let index = random_pick_num(len - 1, &params.insert_pos);
    xml_element.remove_range(&mut trx, index, 1);
  }
}

fn clear_op(doc: &yrs::Doc, nest_input: &YrsNestType, _params: CRDTParam) {
  let xml_element = match nest_input {
    YrsNestType::XMLElementType(xml_element) => xml_element,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();
  let len = xml_element.len(&trx);
  for _ in 0..len {
    xml_element.remove_range(&mut trx, 0, 1);
  }
}

pub static XML_ELEMENT_OPS: TestOps = phf_map! {
    "insert" => insert_op,
    "delete" => remove_op,
    "clear" => clear_op,
};
