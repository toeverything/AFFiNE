import { Entity, LiveData } from '@toeverything/infra';
import { chunk } from 'lodash-es';

import type { DocsService } from '../../doc';
import { IntegrationPropertyService } from '../services/integration-property';
import type { IntegrationRefStore } from '../store/integration-ref';
import type { ReadwiseStore } from '../store/readwise';
import type {
  ReadwiseBook,
  ReadwiseBookMap,
  ReadwiseConfig,
  ReadwiseHighlight,
  ReadwiseRefMeta,
} from '../type';
import { encryptPBKDF2 } from '../utils/encrypt';
import { ReadwiseCrawler } from './readwise-crawler';
import type { IntegrationWriter } from './writer';

export class ReadwiseIntegration extends Entity<{ writer: IntegrationWriter }> {
  writer = this.props.writer;
  crawler = this.framework.createEntity(ReadwiseCrawler);

  constructor(
    private readonly integrationRefStore: IntegrationRefStore,
    private readonly readwiseStore: ReadwiseStore,
    private readonly docsService: DocsService
  ) {
    super();
  }

  importing$ = new LiveData(false);
  settings$ = LiveData.from(this.readwiseStore.watchSetting(), undefined);
  updateSetting<T extends keyof ReadwiseConfig>(
    key: T,
    value: ReadwiseConfig[T]
  ) {
    this.readwiseStore.setSetting(key, value);
  }

  /**
   * Get all integration metas of current user & token in current workspace
   */
  async getRefs() {
    const token = this.readwiseStore.getSetting('token');
    if (!token) return [];

    const integrationId = await encryptPBKDF2(token);

    return this.integrationRefStore
      .getRefs({ type: 'readwise', integrationId })
      .map(ref => ({
        ...ref,
        refMeta: ref.refMeta as ReadwiseRefMeta,
      }));
  }

  async highlightsToAffineDocs(
    highlights: ReadwiseHighlight[],
    books: ReadwiseBookMap,
    options: {
      signal?: AbortSignal;
      onProgress?: (progress: number) => void;
      onComplete?: () => void;
      onAbort?: (finished: number) => void;
    }
  ) {
    this.importing$.next(true);
    const disposables: (() => void)[] = [];
    try {
      const { signal, onProgress, onComplete, onAbort } = options;
      const integrationId = await encryptPBKDF2(
        this.readwiseStore.getSetting('token') ?? ''
      );
      const userId = this.readwiseStore.getUserId();
      const localRefs = await this.getRefs();
      const localRefsMap = new Map(
        localRefs.map(ref => [ref.refMeta.highlightId, ref])
      );
      const updateStrategy = this.readwiseStore.getSetting('updateStrategy');
      const chunks = chunk(highlights, 2);
      const total = highlights.length;
      let finished = 0;

      for (const chunk of chunks) {
        if (signal?.aborted) {
          disposables.forEach(d => d());
          this.importing$.next(false);
          onAbort?.(finished);
          return;
        }
        await Promise.all(
          chunk.map(async highlight => {
            await new Promise(resolve => {
              const id = requestIdleCallback(resolve, { timeout: 500 });
              disposables.push(() => cancelIdleCallback(id));
            });
            const book = books[highlight.book_id];
            const localRef = localRefsMap.get(highlight.id);
            const refMeta = localRef?.refMeta;
            const localUpdatedAt = refMeta?.updatedAt;
            const localDocId = localRef?.id;
            // write if not matched
            if (localUpdatedAt !== highlight.updated_at && !signal?.aborted) {
              await this.highlightToAffineDoc(highlight, book, localDocId, {
                updateStrategy,
                integrationId,
                userId,
              });
            }
            finished++;
            onProgress?.(finished / total);
          })
        );
      }
      onComplete?.();
    } catch (err) {
      console.error('Failed to import readwise highlights', err);
    } finally {
      disposables.forEach(d => d());
      this.importing$.next(false);
    }
  }

  async highlightToAffineDoc(
    highlight: ReadwiseHighlight,
    book: Omit<ReadwiseBook, 'highlights'>,
    docId: string | undefined,
    options: {
      integrationId: string;
      userId: string;
      updateStrategy?: ReadwiseConfig['updateStrategy'];
    }
  ) {
    const { updateStrategy, integrationId } = options;
    const { text, ...highlightWithoutText } = highlight;

    const writtenDocId = await this.writer.writeDoc({
      content: text,
      title: book.title,
      docId,
      comment: highlight.note,
      updateStrategy,
    });

    // write failed
    if (!writtenDocId) return;

    const { doc, release } = this.docsService.open(writtenDocId);
    const integrationPropertyService = doc.scope.get(
      IntegrationPropertyService
    );

    // write doc properties
    integrationPropertyService.updateIntegrationProperties('readwise', {
      ...highlightWithoutText,
      ...book,
    });
    release();

    // update integration ref
    this.integrationRefStore.createRef(doc.id, {
      type: 'readwise',
      integrationId,
      refMeta: {
        highlightId: highlight.id,
        updatedAt: highlight.updated_at,
      },
    });
  }

  disconnect() {
    this.readwiseStore.setSetting('token', undefined);
    this.readwiseStore.setSetting('lastImportedAt', undefined);
  }
}
