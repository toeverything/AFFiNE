import { nanoid } from 'nanoid';
import type { Observable } from 'rxjs';
import { map, of, switchMap } from 'rxjs';
import { Doc, Map as YMap, type Text as YText } from 'yjs';

import { createDB, f, table } from './index';

type Rule = {
  field: string;
  operator: string;
  value: string;
};

const collectionTable = table('collection', {
  id: f.string().required().default(nanoid),
  title: f.string().required(),
  workspaceId: f.string().required(),
  rules: f
    .json<Rule[]>()
    .required()
    .default(() => []),
});

const workspaceTable = table('workspace', {
  id: f.string().required().default(nanoid),
  name: f.string().required(),
});

const pageTable = table('page', {
  id: f.string().required().default(nanoid),
  title: f.string().required(),
  favorite: f
    .boolean()
    .required()
    .default(() => false),
  workspaceId: f.string().required(),
});
const blockTable = table('block', {
  id: f.string().required().default(nanoid),
  pageId: f.string().required(),
  flavor: f.string().required(),
  text: f.raw<YText>(),
  props: f
    .raw<YMap<unknown>>()
    .required()
    .default(() => new YMap()),
});

const doc = new Doc();
const db = createDB(doc);
const workspaceId = 'a';
const aWorkspaceObservable = db.observeFirst(workspaceTable, {
  id: workspaceId,
});

const merge = <A, B, F extends string>(
  a: Observable<A>,
  bf: (a: A) => Observable<B>,
  fieldName: F
) => {
  return a.pipe(
    switchMap(aValue => {
      return bf(aValue).pipe(
        map(bValue => {
          return {
            ...aValue,
            [fieldName]: bValue,
          } as A & { [K in F]: B };
        })
      );
    })
  );
};
const getPages = (workspace?: { id: string }) => {
  return workspace
    ? db.observeList(pageTable, {
        workspaceId: workspace.id,
      })
    : of([]);
};
merge(aWorkspaceObservable, getPages, 'pages').subscribe(workspace => {
  console.log(JSON.stringify(workspace, null, 2));
});
//or
// aWorkspaceObservable.pipe(switchMap(workspace => {
//   return getPages(workspace).pipe(
//     map(pages => {
//       return {
//         ...workspace,
//         pages,
//       };
//     })
//   );
// })).subscribe(workspace => {
//   console.log(JSON.stringify(workspace, null, 2));
// });

const workspaceA = db.create(workspaceTable, {
  id: workspaceId,
  name: 'first workspace',
});
const pageA = db.create(pageTable, {
  title: 'first page',
  workspaceId: workspaceA.id,
  favorite: false,
});
db.create(collectionTable, {
  title: 'first collection',
  workspaceId: workspaceA.id,
  rules: [],
});
db.delete(pageTable, {
  id: pageA.id,
});
db.create(blockTable, {
  flavor: 'text',
  pageId: pageA.id,
});
console.log(doc.toJSON());
