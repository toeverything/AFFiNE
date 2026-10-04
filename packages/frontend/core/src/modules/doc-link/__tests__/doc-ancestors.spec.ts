import { Framework, LiveData } from '@toeverything/infra';
import { firstValueFrom, type Observable, of, skip, take, toArray } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import type { DocsService } from '../../doc';
import type { DocsSearchService } from '../../docs-search';
import { DocAncestorsService, pickParentDoc } from '../services/doc-ancestors';

describe('pickParentDoc', () => {
  test('returns null when there is no candidate', () => {
    expect(pickParentDoc([])).toBeNull();
  });

  test('prefers the oldest doc', () => {
    expect(
      pickParentDoc([
        { id: 'b', createDate: 200, isJournal: false },
        { id: 'a', createDate: 100, isJournal: false },
        { id: 'c', createDate: 300, isJournal: false },
      ])
    ).toBe('a');
  });

  test('prefers non-journal docs over older journals', () => {
    expect(
      pickParentDoc([
        { id: 'journal', createDate: 100, isJournal: true },
        { id: 'doc', createDate: 200, isJournal: false },
      ])
    ).toBe('doc');
  });

  test('falls back to journals when nothing else links to the doc', () => {
    expect(
      pickParentDoc([{ id: 'journal', createDate: 100, isJournal: true }])
    ).toBe('journal');
  });

  test('ranks docs without a create date last', () => {
    expect(
      pickParentDoc([
        { id: 'unknown', isJournal: false },
        { id: 'known', createDate: 100, isJournal: false },
      ])
    ).toBe('known');
  });

  test('is stable regardless of candidate order', () => {
    const candidates = [
      { id: 'b', createDate: 100, isJournal: false },
      { id: 'a', createDate: 100, isJournal: false },
    ];
    expect(pickParentDoc(candidates)).toBe('a');
    expect(pickParentDoc([...candidates].reverse())).toBe('a');
  });
});

describe('DocAncestorsService.watchAncestors', () => {
  // the direct parent is emitted first, then the fully resolved chain
  const resolved = (ancestors$: Observable<string[]>) =>
    firstValueFrom(ancestors$.pipe(skip(1)));

  function createService(refsTo: Record<string, string[]>) {
    const ids = new Set([
      ...Object.keys(refsTo),
      ...Object.values(refsTo).flat(),
    ]);
    const docsMap = new Map(
      Array.from(ids).map((id, index) => [
        id,
        {
          meta$: new LiveData({ createDate: index }),
          properties$: new LiveData({}),
        },
      ])
    );
    const docsSearchService = {
      watchRefsTo: vi.fn((docId: string) => of(refsTo[docId] ?? [])),
    };
    const docsService = { list: { docsMap$: new LiveData(docsMap) } };
    const framework = new Framework();
    framework.service(
      DocAncestorsService,
      () =>
        new DocAncestorsService(
          docsSearchService as unknown as DocsSearchService,
          docsService as unknown as DocsService
        )
    );
    const service = framework.provider().get(DocAncestorsService);
    return { service, docsSearchService };
  }

  test('resolves the chain from the root to the direct parent', async () => {
    const { service } = createService({ leaf: ['middle'], middle: ['root'] });
    expect(await resolved(service.watchAncestors('leaf'))).toEqual([
      'root',
      'middle',
    ]);
  });

  test('emits the direct parent before the full chain is resolved', async () => {
    const { service } = createService({ leaf: ['middle'], middle: ['root'] });
    expect(
      await firstValueFrom(
        service.watchAncestors('leaf').pipe(take(2), toArray())
      )
    ).toEqual([['middle'], ['root', 'middle']]);
  });

  test('stops at cycles', async () => {
    const { service } = createService({ a: ['b'], b: ['c'], c: ['a'] });
    expect(await resolved(service.watchAncestors('a'))).toEqual(['c', 'b']);
  });

  test('stops at 10 ancestors', async () => {
    const refsTo: Record<string, string[]> = {};
    for (let i = 0; i < 20; i++) refsTo[`doc-${i}`] = [`doc-${i + 1}`];
    const { service } = createService(refsTo);
    const ancestors = await resolved(service.watchAncestors('doc-0'));
    expect(ancestors).toHaveLength(10);
    expect(ancestors.at(-1)).toBe('doc-1');
  });
});
