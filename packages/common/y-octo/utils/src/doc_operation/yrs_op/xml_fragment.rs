use phf::phf_map;

use super::*;

fn insert_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let xml_fragment = match nest_input {
    YrsNestType::XMLFragmentType(xml_fragment) => xml_fragment,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();
  let len = xml_fragment.len(&trx);
  let index = random_pick_num(len, &params.insert_pos);
  xml_fragment.insert(&mut trx, index, XmlTextPrelim::new(params.value));
}

fn remove_op(doc: &yrs::Doc, nest_input: &YrsNestType, params: CRDTParam) {
  let xml_fragment = match nest_input {
    YrsNestType::XMLFragmentType(xml_fragment) => xml_fragment,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();
  let len = xml_fragment.len(&trx);
  if len >= 1 {
    let index = random_pick_num(len - 1, &params.insert_pos);
    xml_fragment.remove_range(&mut trx, index, 1);
  }
}

fn clear_op(doc: &yrs::Doc, nest_input: &YrsNestType, _params: CRDTParam) {
  let xml_fragment = match nest_input {
    YrsNestType::XMLFragmentType(xml_fragment) => xml_fragment,
    _ => unreachable!(),
  };
  let mut trx = doc.transact_mut();
  let len = xml_fragment.len(&trx);
  for _ in 0..len {
    xml_fragment.remove_range(&mut trx, 0, 1);
  }
}

pub static XML_FRAGMENT_OPS: TestOps = phf_map! {
    "insert" => insert_op,
    "delete" => remove_op,
    "clear" => clear_op,
};
