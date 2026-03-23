import { isEqual, MISSING, type PlainValue } from './plain';

export type KeyedRecord = { [key: string]: PlainValue };

export type FieldChange = {
  key: string;
  from: PlainValue | typeof MISSING;
  to: PlainValue | typeof MISSING;
};

export type RecordChange = {
  id: string;
  fromRecord: KeyedRecord;
  toRecord: KeyedRecord;
  fields: FieldChange[];
};

export type KeyedDiff = {
  added: { id: string; record: KeyedRecord }[];
  removed: { id: string; record: KeyedRecord }[];
  changed: RecordChange[];
};

export function diffKeyedRecords(
  fromRecords: Map<string, KeyedRecord>,
  toRecords: Map<string, KeyedRecord>
): KeyedDiff {
  const added: { id: string; record: KeyedRecord }[] = [];
  const removed: { id: string; record: KeyedRecord }[] = [];
  const changed: RecordChange[] = [];

  const fromIds = new Set(fromRecords.keys());
  const toIds = new Set(toRecords.keys());

  for (const id of Array.from(toIds).sort()) {
    if (!fromIds.has(id)) {
      const record = toRecords.get(id);
      if (record) {
        added.push({ id, record });
      }
    }
  }

  for (const id of Array.from(fromIds).sort()) {
    if (!toIds.has(id)) {
      const record = fromRecords.get(id);
      if (record) {
        removed.push({ id, record });
      }
    }
  }

  for (const id of Array.from(fromIds).sort()) {
    if (!toIds.has(id)) {
      continue;
    }
    const fromRecord = fromRecords.get(id);
    const toRecord = toRecords.get(id);
    if (!fromRecord || !toRecord) {
      continue;
    }

    const keys = Array.from(
      new Set([...Object.keys(fromRecord), ...Object.keys(toRecord)])
    ).sort();
    const fields: FieldChange[] = [];
    for (const key of keys) {
      const fromValue = Object.hasOwn(fromRecord, key)
        ? fromRecord[key]
        : MISSING;
      const toValue = Object.hasOwn(toRecord, key) ? toRecord[key] : MISSING;
      if (!isEqual(fromValue, toValue)) {
        fields.push({ key, from: fromValue, to: toValue });
      }
    }

    if (fields.length) {
      changed.push({ id, fromRecord, toRecord, fields });
    }
  }

  return { added, removed, changed };
}
