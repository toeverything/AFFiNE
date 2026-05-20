export * from './adapter';
export * from './extension';
export * from './model';
export * from './reactive';
export * from './schema';
export * from './transformer';
export { type IdGenerator, nanoid, uuidv4 } from './utils/id-generator';
export * from './yjs';

const env = (typeof globalThis !== 'undefined'
  ? globalThis
  : typeof window !== 'undefined'
    ? window
    : {}) as unknown as Record<string, boolean>;
const importIdentifier = '__ $BLOCKSUITE_STORE$ __';

if (env[importIdentifier] === true) {
  // https://github.com/yjs/yjs/issues/438
  console.error(
    '@blocksuite/store was already imported. This breaks constructor checks and will lead to issues!'
  );
}
env[importIdentifier] = true;
