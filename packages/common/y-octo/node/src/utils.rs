use napi::{
  bindgen_prelude::{
    Either4, Env, Error, External, Object, Result, Status, ToNapiValue, Unknown, ValueType,
  },
  NapiValue,
};
use y_octo::{AHashMap, Any, HashMapExt, Value};

use super::*;

pub type MixedYType = Either4<YArray, YMap, YText, Unknown>;
pub type MixedRefYType<'a> = Either4<&'a YArray, &'a YMap, &'a YText, Unknown>;

pub fn get_js_unknown_from_any(env: Env, any: Any) -> Result<Unknown> {
  match any {
    Any::Null | Any::Undefined => env.get_null().map(|v| v.into_unknown()),
    Any::True => env.get_boolean(true).map(|v| v.into_unknown()),
    Any::False => env.get_boolean(false).map(|v| v.into_unknown()),
    Any::Integer(number) => env.create_int32(number).map(|v| v.into_unknown()),
    Any::BigInt64(number) => env.create_int64(number).map(|v| v.into_unknown()),
    Any::Float32(number) => env.create_double(number.0 as f64).map(|v| v.into_unknown()),
    Any::Float64(number) => env.create_double(number.0).map(|v| v.into_unknown()),
    Any::String(string) => env.create_string(string.as_str()).map(|v| v.into_unknown()),
    Any::Array(array) => {
      let mut js_array = env.create_array_with_length(array.len())?;
      for (i, value) in array.into_iter().enumerate() {
        js_array.set_element(i as u32, get_js_unknown_from_any(env, value)?)?;
      }
      Ok(js_array.into_unknown())
    }
    _ => env.get_null().map(|v| v.into_unknown()),
  }
}

pub fn get_js_unknown_from_value(env: Env, value: Value) -> Result<Unknown> {
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
      Ok(unsafe {
        Unknown::from_raw_unchecked(env.raw(), ToNapiValue::to_napi_value(env.raw(), external)?)
      })
    }
    _ => env.get_null().map(|v| v.into_unknown()),
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
        if let Ok((obj, key)) = keys.get_element::<Unknown>(i).and_then(|o| {
          o.coerce_to_string().and_then(|obj| {
            obj
              .into_utf8()
              .and_then(|s| s.as_str().map(|s| (obj, s.to_string())))
          })
        }) {
          if let Ok(value) = object.get_property::<_, Unknown>(obj) {
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
    ValueType::Boolean => Ok(
      js_unknown
        .coerce_to_bool()
        .and_then(|v| v.get_value())?
        .into(),
    ),
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
