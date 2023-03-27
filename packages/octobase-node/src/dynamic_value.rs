use lib0::any::Any;
use std::collections::HashMap;

pub type DynamicValueMap = HashMap<String, DynamicValue>;

pub struct DynamicValue {
    any: Any,
}

impl DynamicValue {
    pub fn new(any: Any) -> Self {
        Self { any }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self.any {
            Any::Bool(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_number(&self) -> Option<f64> {
        match self.any {
            Any::Number(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_int(&self) -> Option<i64> {
        match self.any {
            Any::BigInt(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_string(&self) -> Option<String> {
        match &self.any {
            Any::String(value) => Some(value.to_string()),
            _ => None,
        }
    }

    pub fn as_buffer(&self) -> Option<Vec<u8>> {
        match &self.any {
            Any::Buffer(value) => Some(value.to_vec()),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<Vec<DynamicValue>> {
        match &self.any {
            Any::Array(value) => Some(value.iter().map(|a| DynamicValue::new(a.clone())).collect()),
            _ => None,
        }
    }

    pub fn as_map(&self) -> Option<HashMap<String, DynamicValue>> {
        match &self.any {
            Any::Map(value) => Some(
                value
                    .iter()
                    .map(|(key, value)| (key.clone(), DynamicValue::new(value.clone())))
                    .collect(),
            ),
            _ => None,
        }
    }
}
