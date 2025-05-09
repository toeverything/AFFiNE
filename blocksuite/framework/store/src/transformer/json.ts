import { NATIVE_UNIQ_IDENTIFIER, TEXT_UNIQ_IDENTIFIER } from '../consts';
import { isPureObject } from '../reactive';
import { Boxed } from '../reactive/boxed';
import { Text } from '../reactive/text';

export function toJSON(value: unknown): unknown {
  if (value instanceof Boxed) {
    return {
      [NATIVE_UNIQ_IDENTIFIER]: true,
      value: value.getValue(),
    };
  }
  if (value instanceof Text) {
    return {
      [TEXT_UNIQ_IDENTIFIER]: true,
      delta: value.yText.toDelta(),
    };
  }
  if (Array.isArray(value)) {
    return value.map(toJSON);
  }
  if (isPureObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => {
        return [key, toJSON(value)];
      })
    );
  }
  return value;
}

export function fromJSON(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(fromJSON);
  }
  if (typeof value === 'object' && value != null) {
    if (Reflect.has(value, NATIVE_UNIQ_IDENTIFIER)) {
      return new Boxed(Reflect.get(value, 'value'));
    }
    if (Reflect.has(value, TEXT_UNIQ_IDENTIFIER)) {
      return new Text(Reflect.get(value, 'delta'));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => {
        return [key, fromJSON(value)];
      })
    );
  }

  return value;
}
