use napi::{
  bindgen_prelude::{Array as JsArray, Env, JsObjectValue, JsValue, Null, ToNapiValue, Unknown},
  ValueType,
};
use y_octo::{Any, Array, Value};

use super::*;

#[napi]
pub struct YArray {
  pub(crate) array: Array,
}

#[napi]
impl YArray {
  #[allow(clippy::new_without_default)]
  #[napi(constructor)]
  pub fn new() -> Self {
    unimplemented!()
  }

  pub(crate) fn inner_new(array: Array) -> Self {
    Self { array }
  }

  #[napi(getter)]
  pub fn length(&self) -> i64 {
    self.array.len() as i64
  }

  #[napi(getter)]
  pub fn is_empty(&self) -> bool {
    self.array.is_empty()
  }

  #[napi(ts_generic_types = "T = unknown", ts_return_type = "T")]
  pub fn get<'a>(&'a self, env: &'a Env, index: i64) -> Result<MixedYType<'a>> {
    if let Some(value) = self.array.get(index as u64) {
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
    ts_args_type = "index: number, value: YArray | YMap | YText | boolean | number | string | \
                    Record<string, any> | null | undefined"
  )]
  pub fn insert(&mut self, index: i64, value: MixedRefYType) -> Result<()> {
    match value {
      MixedRefYType::A(array) => self
        .array
        .insert(index as u64, array.array.clone())
        .map_err(anyhow::Error::from),
      MixedRefYType::B(map) => self
        .array
        .insert(index as u64, map.map.clone())
        .map_err(anyhow::Error::from),
      MixedRefYType::C(text) => self
        .array
        .insert(index as u64, text.text.clone())
        .map_err(anyhow::Error::from),
      MixedRefYType::D(unknown) => match unknown.get_type() {
        Ok(value_type) => match value_type {
          ValueType::Undefined | ValueType::Null => self
            .array
            .insert(index as u64, Any::Null)
            .map_err(anyhow::Error::from),
          ValueType::Boolean => match unsafe { unknown.cast::<bool>() } {
            Ok(boolean) => self
              .array
              .insert(index as u64, boolean)
              .map_err(anyhow::Error::from),
            Err(e) => Err(anyhow::Error::new(e).context("Failed to coerce value to boolean")),
          },
          ValueType::Number => match unknown.coerce_to_number().and_then(|v| v.get_double()) {
            Ok(number) => self
              .array
              .insert(index as u64, number)
              .map_err(anyhow::Error::from),
            Err(e) => Err(anyhow::Error::new(e).context("Failed to coerce value to number")),
          },
          ValueType::String => {
            match unknown
              .coerce_to_string()
              .and_then(|v| v.into_utf8())
              .and_then(|s| s.as_str().map(|s| s.to_string()))
            {
              Ok(string) => self
                .array
                .insert(index as u64, string)
                .map_err(anyhow::Error::from),
              Err(e) => Err(anyhow::Error::new(e).context("Failed to coerce value to string")),
            }
          }
          ValueType::Object => match unknown
            .coerce_to_object()
            .and_then(|o| o.get_array_length().map(|l| (o, l)))
          {
            Ok((object, length)) => {
              for i in 0..length {
                if let Ok(any) = object
                  .get_element::<Unknown>(i)
                  .and_then(get_any_from_js_unknown)
                {
                  self
                    .array
                    .insert(index as u64 + i as u64, Value::Any(any))
                    .map_err(anyhow::Error::from)?;
                }
              }
              Ok(())
            }
            Err(e) => Err(anyhow::Error::new(e).context("Failed to coerce value to object")),
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
  pub fn remove(&mut self, index: i64, len: i64) -> Result<()> {
    self
      .array
      .remove(index as u64, len as u64)
      .map_err(anyhow::Error::from)
  }

  #[napi]
  pub fn to_json<'env>(&'env self, env: &'env Env) -> Result<JsArray<'env>> {
    let mut js_array = env.create_array(0)?;
    for value in self.array.iter() {
      js_array.insert(get_js_unknown_from_value(env, value)?)?;
    }
    Ok(js_array)
  }
}

#[cfg(test)]
mod tests {

  use super::*;

  #[test]
  fn test_array_init() {
    let doc = Doc::new(None);
    let array = doc.get_or_create_array("array".into()).unwrap();
    assert_eq!(array.length(), 0);
  }
}
