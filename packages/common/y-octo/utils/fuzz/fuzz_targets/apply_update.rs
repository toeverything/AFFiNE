#![no_main]

use std::collections::HashSet;

use libfuzzer_sys::fuzz_target;
use y_octo_utils::{
  gen_nest_type_from_nest_type, gen_nest_type_from_root, CRDTParam, ManipulateSource, OpType,
  OpsRegistry, YrsNestType,
};
use yrs::Transact;

fuzz_target!(|crdt_params: Vec<CRDTParam>| {
  let mut doc = yrs::Doc::new();
  let mut cur_crdt_nest_type: Option<YrsNestType> = None;
  let ops_registry = OpsRegistry::new();
  let mut key_set = HashSet::<String>::new();
  for crdt_param in crdt_params {
    if key_set.contains(&crdt_param.key) {
      continue;
    }

    key_set.insert(crdt_param.key.clone());
    match crdt_param.op_type {
      OpType::HandleCurrent => {
        if cur_crdt_nest_type.is_some() {
          ops_registry.operate_yrs_nest_type(&doc, cur_crdt_nest_type.clone().unwrap(), crdt_param);
        }
      }
      OpType::CreateCRDTNestType => {
        cur_crdt_nest_type = match cur_crdt_nest_type {
          None => gen_nest_type_from_root(&mut doc, &crdt_param),
          Some(mut nest_type) => match crdt_param.manipulate_source {
            ManipulateSource::CurrentNestType => Some(nest_type),
            ManipulateSource::NewNestTypeFromYDocRoot => {
              gen_nest_type_from_root(&mut doc, &crdt_param)
            }
            ManipulateSource::NewNestTypeFromCurrent => {
              gen_nest_type_from_nest_type(&mut doc, crdt_param.clone(), &mut nest_type)
            }
          },
        };
      }
    };
  }

  let trx = doc.transact_mut();
  let binary_from_yrs = trx.encode_update_v1();
  let doc = y_octo::Doc::try_from_binary_v1(&binary_from_yrs).unwrap();
  let binary = doc.encode_update_v1().unwrap();
  assert_eq!(binary, binary_from_yrs);
});
