import { effect, fromPromise, Service, smartRetry } from '@toeverything/infra';
import { catchError, EMPTY, Observable, type Subscription, tap } from 'rxjs';

import type { FeatureFlagService } from '../../feature-flag';
import type { WorkspaceService } from '../../workspace';
import type { DocSummaryStore } from '../stores/doc-summary';

export class DocSummaryService extends Service {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: DocSummaryStore,
    private readonly featureFlagService: FeatureFlagService
  ) {
    super();
  }

  private readonly docSummaryCache = new Map<
    string,
    Observable<string | undefined>
  >();

  watchDocSummary(docId: string) {
    const cached$ = this.docSummaryCache.get(docId);
    if (!cached$) {
      const ob$ = new Observable<string | undefined>(subscribe => {
        if (
          this.workspaceService.workspace.flavour === 'local' ||
          this.featureFlagService.flags.enable_battery_save_mode.value === false
        ) {
          // use local indexer
          const sub = this.store
            .watchDocSummaryFromIndexer(docId)
            .subscribe(subscribe);
          return () => sub.unsubscribe();
        }
        // use cache, and revalidate from cloud
        const sub = this.store.watchDocSummaryCache(docId).subscribe(subscribe);
        this.revalidateDocSummaryFromCloud(docId);
        return () => sub.unsubscribe();
      });
      this.docSummaryCache.set(docId, ob$);
      return ob$;
    }
    return cached$;
  }

  private readonly revalidateDocSummaryFromCloud = effect(
    (source$: Observable<string>) => {
      // make a lifo queue
      const queue: string[] = [];

      let currentTask: Subscription | undefined;

      const processTask = () => {
        if (currentTask) {
          return;
        }
        const docId = queue.pop();
        if (!docId) {
          return;
        }
        currentTask = fromPromise(this.store.getDocSummaryFromCloud(docId))
          .pipe(
            smartRetry(),
            tap(summary => {
              if (summary) {
                this.store.setDocSummaryCache(docId, summary).catch(error => {
                  console.error(error);
                  // ignore error
                });
              }
            }),
            catchError(error => {
              console.error(error);
              // ignore error
              return EMPTY;
            })
          )
          .subscribe({
            complete() {
              currentTask = undefined;
              processTask();
            },
          });
      };

      return new Observable(subscriber => {
        const sub = source$.subscribe({
          next: value => {
            queue.push(value);
            processTask();
          },
          complete: () => {
            subscriber.complete();
          },
        });
        return () => {
          sub.unsubscribe();
          currentTask?.unsubscribe();
        };
      });
    }
  );

  override dispose() {
    this.revalidateDocSummaryFromCloud.unsubscribe();
    super.dispose();
  }
}
