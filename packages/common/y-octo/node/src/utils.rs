use napi::bindgen_prelude::{
  Array, Either4, Env, Error, External, JsObjectValue, JsValue, Null, Object, Result, Status,
  ToNapiValue, Unknown, ValueType,
};
use y_octo::{AHashMap, Any, HashMapExt, Value};

use super::*;

pub type MixedYType<'a> = Either4<YArray, YMap, YText, Unknown<'a>>;
pub type MixedRefYType<'a> = Either4<&'a YArray, &'a YMap, &'a YText, Unknown<'a>>;

pub fn get_js_unknown_from_any(env: &Env, any: Any) -> Result<Unknown> {
  match any {
    Any::Null | Any::Undefined => Null.into_unknown(env),
    Any::True => true.into_unknown(env),
    Any::False => false.into_unknown(env),
    Any::Integer(number) => number.into_unknown(env),
    Any::BigInt64(number) => number.into_unknown(env),
    Any::Float32(number) => number.0.into_unknown(env),
    Any::Float64(number) => number.0.into_unknown(env),
    Any::String(string) => string.into_unknown(env),
    Any::Array(array) => {
      let js_array = Array::from_vec(
        env,
        array
          .into_iter()
          .map(|value| get_js_unknown_from_any(env, value))
          .collect::<Result<Vec<Unknown>>>()?,
      )?;
      Ok(js_array.to_unknown())
    }
    _ => Null.into_unknown(env),
  }
}

pub fn get_js_unknown_from_value(env: &Env, value: Value) -> Result<Unknown> {
  match value {
    Value::Any(any) => get_js_unknown_from_any(env, any),
    Value::Array(array) => {
      let external = External::new(YArray::inner_new(array));
      Ok(unsafe {
        Unknown::from_raw_unchecked(env.raw(), ToNapiValue::to_napi_value(env.raw(), external)?)
      })
    }
    Value::Map(map) => {
      let external = External::new(YMap::inner_new(map));
      Ok(unsafe {
        Unknown::from_raw_unchecked(env.raw(), ToNapiValue::to_napi_value(env.raw(), external)?)
      })
    }
    Value::Text(text) => {
      let external = External::new(YText::inner_new(text));
      external.into_unknown(env)
    }
    _ => Null.into_unknown(env),
  }
}

pub fn get_any_from_js_object(object: Object) -> Result<Any> {
  if let Ok(length) = object.get_array_length() {
    let mut array = Vec::with_capacity(length as usize);
    for i in 0..length {
      if let Ok(value) = object.get_element::<Unknown>(i) {
        array.push(get_any_from_js_unknown(value)?);
      }
    }
    Ok(Any::Array(array))
  } else {
    let mut map = AHashMap::new();
    let keys = object.get_property_names()?;
    if let Ok(length) = keys.get_array_length() {
      for i in 0..length {
        if let Ok(key) = keys.get_element::<Unknown>(i).and_then(|o| {
          o.coerce_to_string().and_then(|obj| {
            obj
              .into_utf8()
              .and_then(|s| s.as_str().map(|s| s.to_string()))
          })
        }) {
          if let Ok(value) = object.get_named_property_unchecked::<Unknown>(&key) {
            println!("key: {}", key);
            map.insert(key, get_any_from_js_unknown(value)?);
          }
        }
      }
    }
    Ok(Any::Object(map))
  }
}

pub fn get_any_from_js_unknown(js_unknown: Unknown) -> Result<Any> {
  match js_unknown.get_type()? {
    ValueType::Undefined | ValueType::Null => Ok(Any::Null),
    ValueType::Boolean => Ok(unsafe { js_unknown.cast::<bool>()? }.into()),
    ValueType::Number => Ok(
      js_unknown
        .coerce_to_number()
        .and_then(|v| v.get_double())
        .map(|v| v.into())?,
    ),
    ValueType::String => Ok(
      js_unknown
        .coerce_to_string()
        .and_then(|v| v.into_utf8())
        .and_then(|s| s.as_str().map(|s| s.to_string()))?
        .into(),
    ),
    ValueType::Object => {
      if let Ok(object) = js_unknown.coerce_to_object() {
        get_any_from_js_object(object)
      } else {
        Err(Error::new(
          Status::InvalidArg,
          "Failed to coerce value to object",
        ))
      }
    }
    _ => Err(Error::new(
      Status::InvalidArg,
      "Failed to coerce value to any",
    )),
  }
}
