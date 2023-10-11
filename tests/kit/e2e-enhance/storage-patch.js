/**
 * @type {import('idb')}
 */
const idb = window.idb;

const createUniqueIndex = (() => {
  let index = 0;
  return () => ++index;
})();

function replaceBinary(value, binaries) {
  if (value instanceof Uint8Array) {
    const name = `__BINARY__${createUniqueIndex()}`;
    binaries[name] = Array.from(value);
    return name;
  }

  if (Array.isArray(value)) {
    return value.map(item => replaceBinary(item, binaries));
  }

  if (typeof value === 'object' && value !== null) {
    const replaced = {};
    for (const key of Object.keys(value)) {
      replaced[key] = replaceBinary(value[key], binaries);
    }
    return replaced;
  }

  return value;
}

function recoveryBinary(value, binaries) {
  if (typeof value === 'string') {
    const arr = binaries[value];
    if (arr) {
      return new Uint8Array(arr);
    }
  }

  if (Array.isArray(value)) {
    return value.map(item => recoveryBinary(item, binaries));
  }

  if (typeof value === 'object' && value !== null) {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = recoveryBinary(value[key], binaries);
    }
    return result;
  }

  return value;
}

async function readAffineDatabase() {
  const idbData = [];
  const binaries = {};

  const databases = await indexedDB.databases();
  for (const databaseInfo of databases) {
    const idbDatabase = await idb.openDB(
      databaseInfo.name,
      databaseInfo.version
    );
    if (!idbDatabase) {
      throw new Error('idbDatabase is null');
    }

    const stores = [];
    const objectStoreNames = Array.from(idbDatabase.objectStoreNames);
    const transaction = idbDatabase.transaction(objectStoreNames, 'readonly');

    for (const storeName of objectStoreNames) {
      const objectStore = transaction.objectStore(storeName);
      const objectValues = await objectStore.getAll();

      stores.push({
        name: storeName,
        keyPath: objectStore.keyPath,
        values: replaceBinary(objectValues, binaries),
      });
    }

    idbData.push({ ...databaseInfo, stores });
  }

  return { idbData, binaries };
}

async function writeAffineDatabase(allDatabases, binaries) {
  for (const database of allDatabases) {
    const idbDatabase = await idb.openDB(database.name, database.version, {
      upgrade(db) {
        for (const objectStore of database.stores) {
          db.createObjectStore(objectStore.name, {
            keyPath: objectStore.keyPath,
          });
        }
      },
    });

    for (const store of database.stores) {
      const transaction = idbDatabase.transaction(store.name, 'readwrite');
      const objectStore = transaction.objectStore(store.name);

      for (const value of store.values) {
        await objectStore.add(recoveryBinary(value, binaries));
      }
    }
  }
}

async function readAffineLocalStorage() {
  const data = {};

  const keys = [
    'jotai-workspaces',
    'last_page_id',
    'last_workspace_id',
    'affine-local-workspace',
    'is-first-open',
  ];
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    data[key] = value;
  }

  return data;
}

async function writeAffineLocalStorage(data) {
  for (const [key, value] of Object.entries(data)) {
    window.localStorage.setItem(key, value);
  }
}

window.readAffineDatabase = readAffineDatabase;
window.writeAffineDatabase = writeAffineDatabase;
window.readAffineLocalStorage = readAffineLocalStorage;
window.writeAffineLocalStorage = writeAffineLocalStorage;
