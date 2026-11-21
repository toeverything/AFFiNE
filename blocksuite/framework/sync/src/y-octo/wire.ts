import { getYOctoTapeSync } from './runtime.js';

function toUint8Array(input: Uint8Array | ArrayLike<number>): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export function validateUpdateV1(update: Uint8Array): void {
  const tape = getYOctoTapeSync();
  const src = toUint8Array(update);
  tape.withInputFrame(src.length, () => {
    tape.u8.set(src, tape.inPtr);
    tape.wPos = tape.inPtr + src.length;
    tape.checkOk(tape.exp.wire_validate_update_v1(src.length));
  });
}

export function encodeStateVectorFromUpdateV1(update: Uint8Array): Uint8Array {
  const tape = getYOctoTapeSync();
  const src = toUint8Array(update);
  return tape.withInputFrame(src.length, () => {
    tape.u8.set(src, tape.inPtr);
    tape.wPos = tape.inPtr + src.length;
    tape.checkOk(tape.exp.wire_encode_sv_from_update_v1(src.length));
    return tape.readRawOutBytes();
  });
}

export function diffUpdateV1(
  update: Uint8Array,
  stateVector: Uint8Array
): Uint8Array {
  const tape = getYOctoTapeSync();
  const u = toUint8Array(update);
  const s = toUint8Array(stateVector);
  return tape.withInputFrame(u.length + s.length, () => {
    tape.u8.set(u, tape.inPtr);
    tape.u8.set(s, tape.inPtr + u.length);
    tape.wPos = tape.inPtr + u.length + s.length;
    tape.checkOk(tape.exp.wire_diff_update_v1(u.length, s.length));
    return tape.readRawOutBytes();
  });
}

export function mergeUpdatesV1(updates: Iterable<Uint8Array>): Uint8Array {
  const tape = getYOctoTapeSync();
  const list = Array.from(updates, u => toUint8Array(u));
  let total = 0;
  for (const src of list) {
    total += 4 + src.length;
  }
  return tape.withInputFrame(total, () => {
    let offset = tape.inPtr;
    for (const src of list) {
      tape.dv.setUint32(offset, src.length, true);
      offset += 4;
      tape.u8.set(src, offset);
      offset += src.length;
    }
    tape.wPos = offset;
    tape.checkOk(tape.exp.wire_merge_updates_v1(total));
    return tape.readRawOutBytes();
  });
}

export function revertUpdateV1(
  currentSnapshot: Uint8Array,
  targetSnapshot: Uint8Array
): Uint8Array {
  const tape = getYOctoTapeSync();
  const cur = toUint8Array(currentSnapshot);
  const tgt = toUint8Array(targetSnapshot);
  return tape.withInputFrame(cur.length + tgt.length, () => {
    tape.u8.set(cur, tape.inPtr);
    tape.u8.set(tgt, tape.inPtr + cur.length);
    tape.wPos = tape.inPtr + cur.length + tgt.length;
    tape.checkOk(tape.exp.wire_revert_update_v1(cur.length, tgt.length));
    return tape.readRawOutBytes();
  });
}
