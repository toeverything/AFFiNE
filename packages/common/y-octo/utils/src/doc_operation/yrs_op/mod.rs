pub mod array;
pub mod map;
pub mod text;
pub mod xml_element;
pub mod xml_fragment;
pub mod xml_text;

use std::collections::HashMap;

use array::*;
use map::*;
use text::*;
use xml_element::*;
use xml_fragment::*;
use xml_text::*;
use yrs::{
  Array, ArrayPrelim, ArrayRef, Doc, GetString, Map, MapPrelim, MapRef, Text, TextPrelim, TextRef, Transact,
  XmlFragment, XmlTextPrelim, XmlTextRef,
};

use super::*;

type TestOp = fn(doc: &Doc, nest_input: &YrsNestType, params: CRDTParam) -> ();
type TestOps = phf::Map<&'static str, TestOp>;

pub struct OpsRegistry<'a>(HashMap<CRDTNestType, &'a TestOps>);

impl Default for OpsRegistry<'_> {
  fn default() -> Self {
    OpsRegistry::new()
  }
}

impl OpsRegistry<'_> {
  pub fn new() -> Self {
    let mut map = HashMap::new();
    map.insert(CRDTNestType::Map, &MAP_OPS);
    map.insert(CRDTNestType::Array, &ARRAY_OPS);
    map.insert(CRDTNestType::Text, &TEXT_OPS);
    map.insert(CRDTNestType::XMLElement, &XML_ELEMENT_OPS);
    map.insert(CRDTNestType::XMLText, &XML_TEXT_OPS);
    map.insert(CRDTNestType::XMLFragment, &XML_FRAGMENT_OPS);

    OpsRegistry(map)
  }

  pub fn get_ops(&self, crdt_nest_type: &CRDTNestType) -> &TestOps {
    match crdt_nest_type {
      CRDTNestType::Map => self.0.get(&CRDTNestType::Map).unwrap(),
      CRDTNestType::Array => self.0.get(&CRDTNestType::Array).unwrap(),
      CRDTNestType::Text => self.0.get(&CRDTNestType::Text).unwrap(),
      CRDTNestType::XMLElement => self.0.get(&CRDTNestType::XMLElement).unwrap(),
      CRDTNestType::XMLFragment => self.0.get(&CRDTNestType::XMLFragment).unwrap(),
      CRDTNestType::XMLText => self.0.get(&CRDTNestType::XMLText).unwrap(),
    }
  }

  pub fn get_ops_from_yrs_nest_type(&self, yrs_nest_type: &YrsNestType) -> &TestOps {
    match yrs_nest_type {
      YrsNestType::MapType(_) => self.get_ops(&CRDTNestType::Map),
      YrsNestType::ArrayType(_) => self.get_ops(&CRDTNestType::Array),
      YrsNestType::TextType(_) => self.get_ops(&CRDTNestType::Text),
      YrsNestType::XMLElementType(_) => self.get_ops(&CRDTNestType::XMLElement),
      YrsNestType::XMLTextType(_) => self.get_ops(&CRDTNestType::XMLText),
      YrsNestType::XMLFragmentType(_) => self.get_ops(&CRDTNestType::XMLFragment),
    }
  }

  pub fn operate_yrs_nest_type(&self, doc: &yrs::Doc, cur_crdt_nest_type: YrsNestType, crdt_param: CRDTParam) {
    let ops = self.get_ops_from_yrs_nest_type(&cur_crdt_nest_type);
    ops
      .get(match &crdt_param.nest_data_op_type {
        NestDataOpType::Insert => NEST_DATA_INSERT,
        NestDataOpType::Delete => NEST_DATA_DELETE,
        NestDataOpType::Clear => NEST_DATA_CLEAR,
      })
      .unwrap()(doc, &cur_crdt_nest_type, crdt_param)
  }
}

pub fn yrs_create_nest_type_from_root(doc: &yrs::Doc, target_type: CRDTNestType, key: &str) -> YrsNestType {
  match target_type {
    CRDTNestType::Array => YrsNestType::ArrayType(doc.get_or_insert_array(key)),
    CRDTNestType::Map => YrsNestType::MapType(doc.get_or_insert_map(key)),
    CRDTNestType::Text => YrsNestType::TextType(doc.get_or_insert_text(key)),
    CRDTNestType::XMLElement => YrsNestType::XMLElementType(doc.get_or_insert_xml_fragment(key)),
    CRDTNestType::XMLFragment => YrsNestType::XMLFragmentType(doc.get_or_insert_xml_fragment(key)),
    CRDTNestType::XMLText => {
      YrsNestType::XMLTextType((AsRef::<XmlTextRef>::as_ref(&doc.get_or_insert_text(key))).clone())
    }
  }
}

pub fn gen_nest_type_from_root(doc: &mut Doc, crdt_param: &CRDTParam) -> Option<YrsNestType> {
  match crdt_param.new_nest_type {
    CRDTNestType::Array => Some(yrs_create_nest_type_from_root(
      doc,
      CRDTNestType::Array,
      crdt_param.key.as_str(),
    )),
    CRDTNestType::Map => Some(yrs_create_nest_type_from_root(
      doc,
      CRDTNestType::Map,
      crdt_param.key.as_str(),
    )),
    CRDTNestType::Text => Some(yrs_create_nest_type_from_root(
      doc,
      CRDTNestType::Text,
      crdt_param.key.as_str(),
    )),
    CRDTNestType::XMLText => Some(yrs_create_nest_type_from_root(
      doc,
      CRDTNestType::XMLText,
      crdt_param.key.as_str(),
    )),
    CRDTNestType::XMLElement => Some(yrs_create_nest_type_from_root(
      doc,
      CRDTNestType::XMLElement,
      crdt_param.key.as_str(),
    )),
    CRDTNestType::XMLFragment => Some(yrs_create_nest_type_from_root(
      doc,
      CRDTNestType::XMLFragment,
      crdt_param.key.as_str(),
    )),
  }
}

pub fn gen_nest_type_from_nest_type(
  doc: &mut Doc,
  crdt_param: CRDTParam,
  nest_type: &mut YrsNestType,
) -> Option<YrsNestType> {
  match crdt_param.new_nest_type {
    CRDTNestType::Array => yrs_create_array_from_nest_type(doc, nest_type, &crdt_param.insert_pos, crdt_param.key)
      .map(YrsNestType::ArrayType),
    CRDTNestType::Map => {
      yrs_create_map_from_nest_type(doc, nest_type, &crdt_param.insert_pos, crdt_param.key).map(YrsNestType::MapType)
    }
    CRDTNestType::Text => {
      yrs_create_text_from_nest_type(doc, nest_type, &crdt_param.insert_pos, crdt_param.key).map(YrsNestType::TextType)
    }
    _ => None,
  }
}

pub fn random_pick_num(len: u32, insert_pos: &InsertPos) -> u32 {
  match insert_pos {
    InsertPos::BEGIN => 0,
    InsertPos::MID => len / 2,
    InsertPos::END => len,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_ops_registry_new() {
    let ops_registry = OpsRegistry::new();
    assert_eq!(ops_registry.0.len(), 6);
  }

  #[test]
  fn test_ops_registry_get_ops() {
    let ops_registry = OpsRegistry::new();
    let ops = ops_registry.get_ops(&CRDTNestType::Array);
    assert!(!ops.is_empty());
  }

  #[test]
  fn test_ops_registry_get_ops_from_yrs_nest_type() {
    let doc = yrs::Doc::new();
    let array = doc.get_or_insert_array("array");
    let ops_registry = OpsRegistry::new();
    let ops = ops_registry.get_ops_from_yrs_nest_type(&YrsNestType::ArrayType(array));
    assert!(!ops.is_empty());
  }
}
