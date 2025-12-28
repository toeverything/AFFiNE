function cleanupUnusedIndexedDB() {
  const indexedDB = window.indexedDB;
  if (!indexedDB) {
    return;
  }

  indexedDB
    .databases()
    .then(databases => {
      databases.forEach(database => {
        if (database.name?.endsWith(':server-clock')) {
          indexedDB.deleteDatabase(database.name);
        }
        if (database.name?.endsWith(':sync-metadata')) {
          indexedDB.deleteDatabase(database.name);
        }
        if (
          database.name?.startsWith('idx:') &&
          (database.name.endsWith(':block') || database.name.endsWith(':doc'))
        ) {
          indexedDB.deleteDatabase(database.name);
        }
        if (database.name?.startsWith('jp:')) {
          indexedDB.deleteDatabase(database.name);
        }
      });
    })
    .catch(error => {
      console.error('Failed to cleanup unused IndexedDB databases:', error);
    });
}

cleanupUnusedIndexedDB();
