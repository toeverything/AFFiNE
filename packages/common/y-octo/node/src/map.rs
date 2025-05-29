use napi::bindgen_prelude::{Env, JsValue, Null, Object, ToNapiValue, ValueType};
use y_octo::{Any, Map, Value};

use super::*;

#[napi]
pub struct YMap {
  pub(crate) map: Map,
}

#[napi]
impl YMap {
  pub(crate) fn inner_new(map: Map) -> Self {
    Self { map }
  }

  #[napi(getter)]
  pub fn length(&self) -> i64 {
    self.map.len() as i64
  }

  #[napi(getter)]
  pub fn is_empty(&self) -> bool {
    self.map.is_empty()
  }

  #[napi(ts_generic_types = "T = unknown", ts_return_type = "T")]
  pub fn get<'a>(&'a self, env: &'a Env, key: String) -> Result<MixedYType<'a>> {
    if let Some(value) = self.map.get(&key) {
      match value {
        Value::Any(any) => get_js_unknown_from_any(env, any).map(MixedYType::D),
        Value::Array(array) => Ok(MixedYType::A(YArray::inner_new(array))),
        Value::Map(map) => Ok(MixedYType::B(YMap::inner_new(map))),
        Value::Text(text) => Ok(MixedYType::C(YText::inner_new(text))),
        _ => Null.into_unknown(env).map(MixedYType::D),
      }
      .map_err(anyhow::Error::from)
    } else {
      Ok(MixedYType::D(Null.into_unknown(env)?))
    }
  }

  #[napi(
    ts_args_type = "key: string, value: YArray | YMap | YText | boolean | number | string | \
                    Record<string, any> | null | undefined"
  )]
  pub fn set(&mut self, key: String, value: MixedRefYType) -> Result<()> {
    match value {
      MixedRefYType::A(array) => self
        .map
        .insert(key, array.array.clone())
        .map_err(anyhow::Error::from),
      MixedRefYType::B(map) => self
        .map
        .insert(key, map.map.clone())
        .map_err(anyhow::Error::from),
      MixedRefYType::C(text) => self
        .map
        .insert(key, text.text.clone())
        .map_err(anyhow::Error::from),
      MixedRefYType::D(unknown) => match unknown.get_type() {
        Ok(value_type) => match value_type {
          ValueType::Undefined | ValueType::Null => {
            self.map.insert(key, Any::Null).map_err(anyhow::Error::from)
          }
          ValueType::Boolean => match unsafe { unknown.cast::<bool>() } {
            Ok(boolean) => self.map.insert(key, boolean).map_err(anyhow::Error::from),
            Err(e) => Err(anyhow::Error::from(e).context("Failed to coerce value to boolean")),
          },
          ValueType::Number => match unknown.coerce_to_number().and_then(|v| v.get_double()) {
            Ok(number) => self.map.insert(key, number).map_err(anyhow::Error::from),
            Err(e) => Err(anyhow::Error::from(e).context("Failed to coerce value to number")),
          },
          ValueType::String => {
            match unknown
              .coerce_to_string()
              .and_then(|v| v.into_utf8())
              .and_then(|s| s.as_str().map(|s| s.to_string()))
            {
              Ok(string) => self.map.insert(key, string).map_err(anyhow::Error::from),
              Err(e) => Err(anyhow::Error::from(e).context("Failed to coerce value to string")),
            }
          }
          ValueType::Object => match unknown.coerce_to_object().and_then(get_any_from_js_object) {
            Ok(any) => self
              .map
              .insert(key, Value::Any(any))
              .map_err(anyhow::Error::from),
            Err(e) => Err(anyhow::Error::from(e).context("Failed to coerce value to object")),
          },
          ValueType::BigInt => Err(anyhow::Error::msg("BigInt values are not supported")),
          ValueType::Symbol => Err(anyhow::Error::msg("Symbol values are not supported")),
          ValueType::Function => Err(anyhow::Error::msg("Function values are not supported")),
          ValueType::External => Err(anyhow::Error::msg("External values are not supported")),
          ValueType::Unknown => Err(anyhow::Error::msg("Unknown values are not supported")),
        },
        Err(e) => Err(anyhow::Error::from(e)),
      },
    }
  }

  #[napi]
  pub fn remove(&mut self, key: String) {
    self.map.remove(&key);
  }

  #[napi]
  pub fn to_json(&self, env: Env) -> Result<Object> {
    let mut js_object = Object::new(&env)?;
    for (key, value) in self.map.iter() {
      js_object.set(key, get_js_unknown_from_value(&env, value))?;
    }
    Ok(js_object)
  }
}

#[cfg(test)]
mod tests {

  use super::*;

  #[test]
  fn test_map_init() {
    let doc = Doc::new(None);
    let text = doc.get_or_create_map("map".into()).unwrap();
    assert_eq!(text.length(), 0);
  }
}
