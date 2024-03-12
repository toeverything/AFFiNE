import Y from 'yjs';

import { ServerClient } from './client';
import { timeline } from './timeline';

const nestedExample = async () => {
  const migrateCollection = (doc: Y.Doc) => {
    let collection = doc
      .getMap('userSetting')
      .get('collection') as Y.Array<unknown>;
    if (!collection) {
      collection = new Y.Array();
      doc.getMap('userSetting').set('collection', collection);
    }
    return collection;
  };
  await migrateTest((doc, clientName) => {
    const collection = migrateCollection(doc);
    collection.insert(0, [clientName]);
  });
};
const flatExample = async () => {
  await migrateTest((doc, clientName) => {
    doc.getArray('collection').insert(0, [clientName]);
  });
};

const migrateTest = async (
  migrate: (doc: Y.Doc, clientName: string) => void
) => {
  const dataLog = () => {
    console.log(
      JSON.stringify(clientA.doc.toJSON(), null, 2),
      JSON.stringify(clientB.doc.toJSON(), null, 2)
    );
  };
  const doc1 = new Y.Doc();

  const serverClient = ServerClient.fromDoc(doc1);
  const clientA = serverClient.forkClient();
  const clientB = serverClient.forkClient();
  dataLog();
  await timeline
    .step('clientB offline', async () => {
      clientB.offline();
    })
    .step('clientA migrating', async () => {
      migrate(clientA.doc, 'A');
      dataLog();
    })
    .step('clientB migrating', async () => {
      migrate(clientB.doc, 'B');
      dataLog();
    })
    .step('clientB online', async () => {
      clientB.online();
    })
    .run();
  dataLog();
  // 在这里断言 expect(clientA.snapshot).toEqual(expectSnapshot)
};
setTimeout(() => {
  console.group('nested data example');
  nestedExample()
    .then(async () => {
      console.groupEnd();
      console.group('flat data example');
      await flatExample();
      console.groupEnd();
    })
    .catch(e => {
      console.error(e);
    });
}, 2000);
