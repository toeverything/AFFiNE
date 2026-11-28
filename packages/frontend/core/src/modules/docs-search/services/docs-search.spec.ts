/** @vitest-environment happy-dom */

import 'fake-indexeddb/auto';

import { IndexerDocument, type IndexerStorage } from '@affine/nbstore';
import { IndexedDBIndexerStorage } from '@affine/nbstore/idb';
import { Framework } from '@toeverything/infra';
import { firstValueFrom, map, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DocsSearchService } from './docs-search';

describe('DocsSearchService', () => {
  it('matches partial file names without depending on the indexer', async () => {
    const indexer = {
      state$: of({ indexing: 0, errorMessage: null }),
      search$: vi.fn(),
    };
    const framework = new Framework();
    framework.service(
      DocsSearchService,
      () =>
        new DocsSearchService(
          { workspace: { engine: { indexer } } } as never,
          {
            allDocTitle$: () =>
              of([
                { id: 'header', title: 'WeaponActor.h' },
                { id: 'source', title: 'WeaponActor.cpp' },
                { id: 'generated-source', title: 'WeaponActor.gen.cpp' },
                { id: 'generated-header', title: 'WeaponActor.generated.h' },
                { id: 'other', title: 'UHTStudy.init.gen.cpp' },
              ]),
          } as never
        )
    );
    const service = framework.provider().get(DocsSearchService);

    for (const query of ['W', 'weapon', 'WeaponActor.']) {
      await expect(
        firstValueFrom(service.searchTitle$(query, 'contains'))
      ).resolves.toEqual([
        'header',
        'source',
        'generated-source',
        'generated-header',
      ]);
    }
    expect(indexer.search$).not.toHaveBeenCalled();
  });

  it('skips malformed reference items without poisoning the result', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const indexer = {
      state$: of({ indexing: 0, errorMessage: null }),
      search$: vi.fn().mockReturnValue(
        of({
          nodes: [
            {
              fields: {
                docId: 'source',
                ref: [
                  JSON.stringify({ docId: 'target' }),
                  '{invalid-json',
                  JSON.stringify({ docId: 42 }),
                  7,
                ],
              },
            },
          ],
        })
      ),
    };
    const workspaceService = { workspace: { engine: { indexer } } };
    const docsService = {
      list: {
        doc$: (id: string) => ({
          value:
            id === 'target'
              ? { id, title$: { value: 'Target document' } }
              : null,
        }),
      },
    };
    const framework = new Framework();
    framework.service(
      DocsSearchService,
      () =>
        new DocsSearchService(
          workspaceService as unknown as ConstructorParameters<
            typeof DocsSearchService
          >[0],
          docsService as unknown as ConstructorParameters<
            typeof DocsSearchService
          >[1]
        )
    );
    const service = framework.provider().get(DocsSearchService);

    await expect(
      firstValueFrom(service.watchRefsFrom('source'))
    ).resolves.toEqual([
      { docId: 'target', title: 'Target document', params: undefined },
    ]);
    expect(warn).toHaveBeenCalledWith(
      '[docs-search] skipped malformed references',
      { count: 3 }
    );
    warn.mockRestore();
  });

  it('groups one batch of references by source document', async () => {
    const indexer = {
      state$: of({ indexing: 0, errorMessage: null }),
      search$: vi.fn().mockReturnValue(
        of({
          nodes: [
            {
              fields: {
                docId: 'a',
                ref: JSON.stringify({ docId: 'target-a' }),
              },
            },
            {
              fields: {
                docId: ['b'],
                ref: [
                  JSON.stringify({ docId: 'target-b' }),
                  JSON.stringify({ docId: 'b' }),
                ],
              },
            },
          ],
        })
      ),
    };
    const docs = new Map([
      ['target-a', 'Target A'],
      ['target-b', 'Target B'],
    ]);
    const framework = new Framework();
    framework.service(
      DocsSearchService,
      () =>
        new DocsSearchService(
          { workspace: { engine: { indexer } } } as never,
          {
            list: {
              doc$: (id: string) => ({
                value: docs.has(id)
                  ? { id, title$: { value: docs.get(id) } }
                  : null,
              }),
            },
          } as never
        )
    );
    const service = framework.provider().get(DocsSearchService);

    const grouped = await firstValueFrom(
      service.watchRefsBySourceFrom(['a', 'b'])
    );
    expect([...grouped]).toEqual([
      ['a', [{ docId: 'target-a', title: 'Target A', params: undefined }]],
      ['b', [{ docId: 'target-b', title: 'Target B', params: undefined }]],
    ]);
    expect(indexer.search$).toHaveBeenCalledTimes(1);
    expect(indexer.search$.mock.calls[0][2]).toMatchObject({
      pagination: { limit: Infinity },
    });
  });

  it.each(['offset', 'cursor'] as const)(
    'finds linked database rows by current visible titles with %s pagination',
    async pagination => {
      const indexer: IndexerStorage = new IndexedDBIndexerStorage({
        flavour: 'test',
        type: 'workspace',
        id: `linked-row-search-${pagination}`,
      });
      indexer.connection.connect();
      await indexer.connection.waitForConnected();
      const titles = new Map([
        ['database', 'Database'],
        ['plain', 'Plain document'],
        ['hidden-target', 'Planning private'],
      ]);
      let failure: 'titles' | 'page' | 'rows' | 'ordinary' | undefined;
      const lookupError = new Error('index lookup failed');
      const framework = new Framework();
      framework.service(
        DocsSearchService,
        () =>
          new DocsSearchService(
            {
              workspace: {
                engine: {
                  indexer: {
                    state$: of({ indexing: 0, errorMessage: null }),
                    search$: (
                      ...args: Parameters<IndexerStorage['search$']>
                    ) =>
                      failure === 'titles'
                        ? throwError(() => lookupError)
                        : indexer.search$(...args).pipe(
                            map(page => ({
                              ...page,
                              pagination: {
                                ...page.pagination,
                                nextCursor:
                                  pagination === 'cursor' &&
                                  page.pagination.hasMore
                                    ? `titles:${page.nodes.length}`
                                    : undefined,
                              },
                            }))
                          ),
                    search: async (
                      ...[table, query, options]: Parameters<
                        IndexerStorage['search']
                      >
                    ) => {
                      if (failure === 'page') throw lookupError;
                      const pageOptions = options?.pagination;
                      if (pagination === 'cursor') {
                        expect(pageOptions?.skip).toBeUndefined();
                        expect(pageOptions?.cursor).toBe('titles:50');
                      }
                      return await indexer.search(table, query, {
                        ...options,
                        pagination: {
                          ...pageOptions,
                          skip:
                            pagination === 'cursor'
                              ? Number(
                                  pageOptions?.cursor?.slice('titles:'.length)
                                )
                              : pageOptions?.skip,
                        },
                      });
                    },
                    aggregate$: (
                      ...args: Parameters<IndexerStorage['aggregate$']>
                    ) =>
                      failure === 'ordinary'
                        ? throwError(() => lookupError)
                        : indexer.aggregate$(...args),
                    aggregate: (
                      ...args: Parameters<IndexerStorage['aggregate']>
                    ) =>
                      failure === 'rows'
                        ? Promise.reject(lookupError)
                        : indexer.aggregate(...args),
                  },
                },
              },
            } as never,
            {
              list: {
                doc$: (id: string) => ({
                  value: titles.has(id)
                    ? { id, title$: { value: titles.get(id) } }
                    : null,
                }),
              },
            } as never
          )
      );
      try {
        for (let i = 0; i < 51; i++) {
          await indexer.insert(
            'doc',
            IndexerDocument.from<'doc'>(
              `physical-title-${String(i).padStart(2, '0')}`,
              {
                docId: `target-${i}`,
                title: `Planning notes ${i}`,
              }
            )
          );
        }
        for (const [id, docId, content, refDocId, parentFlavour] of [
          ['row', 'database', ' ', 'target-50', 'affine:database'],
          ['private-row', 'database', ' ', 'hidden-target', 'affine:database'],
          ['paragraph', 'plain', 'Planning ordinary text', '', 'affine:note'],
        ]) {
          await indexer.insert(
            'block',
            IndexerDocument.from<'block'>(id, {
              docId,
              blockId: id,
              content,
              refDocId,
              flavour: 'affine:paragraph',
              parentFlavour,
            })
          );
        }
        await indexer.refresh('doc');
        await indexer.refresh('block');
        const service = framework.provider().get(DocsSearchService);
        const results = await firstValueFrom(
          service.search$('Planning', 'local')
        );
        expect(results.map(result => result.docId)).toEqual([
          'plain',
          'database',
        ]);
        expect(results[1]).toMatchObject({
          blockId: 'row',
          blockContent: 'Planning notes 50',
        });
        for (failure of ['titles', 'page', 'rows'] as const) {
          expect(
            await firstValueFrom(service.search$('Planning', 'local'))
          ).toEqual([results[0]]);
        }
        failure = 'ordinary';
        await expect(
          firstValueFrom(service.search$('Planning', 'local'))
        ).rejects.toBe(lookupError);

        failure = 'page';
        const liveResults: { docId: string }[][] = [];
        const subscription = service
          .search$('Planning', 'local')
          .subscribe(result => liveResults.push(result));
        try {
          await vi.waitFor(() => expect(liveResults).toEqual([[results[0]]]));
          failure = undefined;
          await indexer.update(
            'doc',
            IndexerDocument.from<'doc'>('physical-title-0', {
              docId: 'target-0',
              title: 'Planning refreshed',
            })
          );
          await indexer.refresh('doc');
          await vi.waitFor(
            () =>
              expect(liveResults.at(-1)?.map(result => result.docId)).toEqual([
                'plain',
                'database',
              ]),
            { timeout: 4000 }
          );
        } finally {
          subscription.unsubscribe();
        }
        await indexer.update(
          'doc',
          IndexerDocument.from<'doc'>('physical-title-50', {
            docId: 'target-50',
            title: 'Execution notes',
          })
        );
        await indexer.refresh('doc');
        expect(
          (await firstValueFrom(service.search$('Planning', 'local'))).map(
            result => result.docId
          )
        ).toEqual(['plain']);
        expect(
          await firstValueFrom(service.search$('Execution', 'local'))
        ).toMatchObject([
          {
            docId: 'database',
            blockId: 'row',
            blockContent: 'Execution notes',
          },
        ]);
      } finally {
        indexer.connection.disconnect();
      }
    }
  );
});
