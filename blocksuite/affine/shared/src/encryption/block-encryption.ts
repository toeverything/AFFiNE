import type { BlockModel, Store } from '@blocksuite/store';
import { fromJSON, internalPrimitives, Text, toJSON } from '@blocksuite/store';
import { signal } from '@preact/signals-core';
import * as Y from 'yjs';

import {
  createPasswordAesSession,
  decryptStringWithSession,
  encryptStringWithPassword,
  encryptStringWithSession,
  type PasswordAesSession,
  type PasswordEncryptedPayload,
} from './password-aes.js';

export const BLOCK_ENCRYPTION_PROP = 'affineBlockEncryption';

export type EncryptedBlockSnapshot = {
  version: 1;
  props: Record<string, unknown>;
};

export type BlockEncryptionState = {
  version: 1;
  type: 'affine:block-encryption';
  payload: PasswordEncryptedPayload;
  encryptedKeys: string[];
  placeholderProps: Record<string, unknown>;
};

const localUnlockedBlocks = new WeakSet<BlockModel>();

const localEncryptionSessions = new WeakMap<BlockModel, PasswordAesSession>();

function getProps(model: BlockModel) {
  return model.props as Record<string, unknown>;
}

function getRecordModel(model: BlockModel) {
  return model as BlockModel<Record<string, unknown>>;
}

function ensurePropKey(model: BlockModel, key: string) {
  if (!model.keys.includes(key)) {
    model.keys.push(key);
  }

  const props = getProps(model);
  const signalKey = `${key}$`;
  if (!(signalKey in props)) {
    props[signalKey] = signal(undefined);
  }
}

function getSchemaDefaultProps(model: BlockModel) {
  return model.schema.model.props?.(internalPrimitives) ?? {};
}

function serializeProps(props: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys
      .map(key => [key, toJSON(props[key])] as const)
      .filter(([, value]) => value !== undefined)
  );
}

function deserializeProps(props: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys.map(key => [key, fromJSON(props[key])] as const)
  );
}

function attachLocalTexts(value: unknown): unknown {
  if (value instanceof Text) {
    if (!value.yText.doc) {
      const localDoc = new Y.Doc();
      localDoc.getMap('props').set('text', value.yText);
    }
    return value;
  }

  if (Array.isArray(value)) {
    value.forEach(attachLocalTexts);
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(attachLocalTexts);
  }

  return value;
}

function collectTexts(value: unknown, texts: Text[] = []) {
  if (value instanceof Text) {
    texts.push(value);
    return texts;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectTexts(item, texts));
    return texts;
  }

  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(item => collectTexts(item, texts));
  }

  return texts;
}

function getEncryptedSnapshot(model: BlockModel, keys: string[]) {
  return {
    version: 1,
    props: serializeProps(getProps(model), keys),
  } satisfies EncryptedBlockSnapshot;
}

function getEncryptableKeys(model: BlockModel) {
  return model.keys.filter(key => key !== BLOCK_ENCRYPTION_PROP);
}

export function getBlockEncryptionState(
  model: BlockModel
): BlockEncryptionState | null {
  const state = getProps(model)[BLOCK_ENCRYPTION_PROP];
  if (
    typeof state !== 'object' ||
    state === null ||
    (state as BlockEncryptionState).type !== 'affine:block-encryption'
  ) {
    return null;
  }

  return state as BlockEncryptionState;
}

export function isBlockEncrypted(model: BlockModel) {
  return getBlockEncryptionState(model) !== null;
}

export function isBlockLocallyUnlocked(model: BlockModel) {
  return localUnlockedBlocks.has(model);
}

export function canEncryptBlock(model: BlockModel) {
  return model.role === 'content' && !isBlockEncrypted(model);
}

export async function encryptBlockWithPassword(
  store: Store,
  model: BlockModel,
  password: string
) {
  if (!password) {
    throw new Error('Password is required.');
  }

  if (!canEncryptBlock(model)) {
    throw new Error('Block cannot be encrypted.');
  }

  const keys = getEncryptableKeys(model);
  const snapshot = getEncryptedSnapshot(model, keys);
  const payload = await encryptStringWithPassword(
    JSON.stringify(snapshot),
    password
  );
  const defaults = getSchemaDefaultProps(model);
  const placeholderProps = serializeProps(defaults, keys);
  const state: BlockEncryptionState = {
    version: 1,
    type: 'affine:block-encryption',
    payload,
    encryptedKeys: keys,
    placeholderProps,
  };

  ensurePropKey(model, BLOCK_ENCRYPTION_PROP);
  store.updateBlock(model, {
    ...deserializeProps(placeholderProps, keys),
    [BLOCK_ENCRYPTION_PROP]: state,
  });
}

export async function unlockBlockWithPassword(
  model: BlockModel,
  password: string
) {
  const state = getBlockEncryptionState(model);
  if (!state) return;

  const session = await createPasswordAesSession(state.payload, password);
  const snapshot = JSON.parse(
    await decryptStringWithSession(state.payload, session)
  ) as EncryptedBlockSnapshot;

  state.encryptedKeys.forEach(key => {
    getRecordModel(model).stash(key);
  });

  const decryptedProps = deserializeProps(snapshot.props, state.encryptedKeys);
  Object.entries(decryptedProps).forEach(([key, value]) => {
    getProps(model)[key] = attachLocalTexts(value);
  });
  localEncryptionSessions.set(model, session);
  localUnlockedBlocks.add(model);
}

export function getUnlockedBlockTexts(model: BlockModel) {
  const state = getBlockEncryptionState(model);
  if (!state || !isBlockLocallyUnlocked(model)) return [];

  return state.encryptedKeys.flatMap(key => collectTexts(getProps(model)[key]));
}

export async function persistUnlockedBlockEdits(
  store: Store,
  model: BlockModel
) {
  const state = getBlockEncryptionState(model);
  const session = localEncryptionSessions.get(model);
  if (!state || !session || !isBlockLocallyUnlocked(model)) return;

  const payload = await encryptStringWithSession(
    JSON.stringify(getEncryptedSnapshot(model, state.encryptedKeys)),
    session
  );

  const nextState: BlockEncryptionState = {
    ...state,
    payload,
  };

  store.updateBlock(model, {
    [BLOCK_ENCRYPTION_PROP]: nextState,
  });
}

export function lockBlock(model: BlockModel) {
  const state = getBlockEncryptionState(model);
  if (!state) return;

  const placeholderProps = deserializeProps(
    state.placeholderProps,
    state.encryptedKeys
  );

  state.encryptedKeys.forEach(key => {
    getProps(model)[key] = placeholderProps[key];
    getRecordModel(model).pop(key);
  });

  localUnlockedBlocks.delete(model);
  localEncryptionSessions.delete(model);
}

export async function lockBlockWithEncryptedEdits(
  store: Store,
  model: BlockModel
) {
  await persistUnlockedBlockEdits(store, model);
  lockBlock(model);
}

export function getBlockEncryptedPreview(model: BlockModel) {
  return getBlockEncryptionState(model)?.payload.ciphertext ?? '';
}
