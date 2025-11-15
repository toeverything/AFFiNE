use yrs::{ArrayRef, MapRef, TextRef, XmlFragmentRef, XmlTextRef};

pub const NEST_DATA_INSERT: &str = "insert";
pub const NEST_DATA_DELETE: &str = "delete";
pub const NEST_DATA_CLEAR: &str = "clear";

#[derive(Hash, PartialEq, Eq, Clone, Debug, arbitrary::Arbitrary)]
pub enum OpType {
  HandleCurrent,
  CreateCRDTNestType,
}

#[derive(Hash, PartialEq, Eq, Clone, Debug, arbitrary::Arbitrary)]
pub enum NestDataOpType {
  Insert,
  Delete,
  Clear,
}

#[derive(PartialEq, Clone, Debug, arbitrary::Arbitrary)]
pub struct CRDTParam {
  pub op_type: OpType,
  pub new_nest_type: CRDTNestType,
  pub manipulate_source: ManipulateSource,
  pub insert_pos: InsertPos,
  pub key: String,
  pub value: String,
  pub nest_data_op_type: NestDataOpType,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, arbitrary::Arbitrary)]
pub enum CRDTNestType {
  Array,
  Map,
  Text,
  XMLElement,
  XMLFragment,
  XMLText,
}

#[derive(Debug, Clone, PartialEq, arbitrary::Arbitrary)]
pub enum ManipulateSource {
  NewNestTypeFromYDocRoot,
  CurrentNestType,
  NewNestTypeFromCurrent,
}

#[derive(Debug, Clone, PartialEq, arbitrary::Arbitrary)]
pub enum InsertPos {
  BEGIN,
  MID,
  END,
}

#[derive(Clone)]
pub enum YrsNestType {
  ArrayType(ArrayRef),
  MapType(MapRef),
  TextType(TextRef),
  XMLElementType(XmlFragmentRef),
  XMLFragmentType(XmlFragmentRef),
  XMLTextType(XmlTextRef),
}
