import type { InvoicesQuery } from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  Entity,
  exhaustMapSwitchUntilChanged,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { map, tap } from 'rxjs';

import type { WorkspaceService } from '../../workspace';
import type { WorkspaceServerService } from '../services/workspace-server';
import { InvoicesStore } from '../stores/invoices';

export type Invoice = NonNullable<
  InvoicesQuery['currentUser']
>['invoices'][number];

export class WorkspaceInvoices extends Entity {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService
  ) {
    super();
  }

  store = this.workspaceServerService.server?.scope.get(InvoicesStore);

  pageNum$ = new LiveData(0);
  invoiceCount$ = new LiveData<number | undefined>(undefined);
  pageInvoices$ = new LiveData<Invoice[] | undefined>(undefined);

  isLoading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  readonly PAGE_SIZE = 8;

  readonly revalidate = effect(
    map(() => this.pageNum$.value),
    exhaustMapSwitchUntilChanged(
      (a, b) => a === b,
      pageNum => {
        return fromPromise(async signal => {
          if (!this.store) {
            throw new Error('No invoices store');
          }
          return this.store.fetchWorkspaceInvoices(
            pageNum * this.PAGE_SIZE,
            this.PAGE_SIZE,
            this.workspaceService.workspace.id,
            signal
          );
        }).pipe(
          tap(data => {
            this.invoiceCount$.setValue(data.invoiceCount);
            this.pageInvoices$.setValue(data.invoices);
          }),
          smartRetry(),
          catchErrorInto(this.error$),
          onStart(() => {
            this.pageInvoices$.setValue(undefined);
            this.isLoading$.setValue(true);
          }),
          onComplete(() => this.isLoading$.setValue(false))
        );
      }
    )
  );

  setPageNum(pageNum: number) {
    this.pageNum$.setValue(pageNum);
  }

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
