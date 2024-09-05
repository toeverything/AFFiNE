import type { InvoicesQuery } from '@affine/graphql';
import {
  backoffRetry,
  catchErrorInto,
  effect,
  Entity,
  exhaustMapSwitchUntilChanged,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { EMPTY, map, mergeMap } from 'rxjs';

import { isBackendError, isNetworkError } from '../error';
import type { InvoicesStore } from '../stores/invoices';

export type Invoice = NonNullable<
  InvoicesQuery['currentUser']
>['invoices'][number];

export class Invoices extends Entity {
  constructor(private readonly store: InvoicesStore) {
    super();
  }

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
          return this.store.fetchInvoices(
            pageNum * this.PAGE_SIZE,
            this.PAGE_SIZE,
            signal
          );
        }).pipe(
          mergeMap(data => {
            this.invoiceCount$.setValue(data.invoiceCount);
            this.pageInvoices$.setValue(data.invoices);
            return EMPTY;
          }),
          backoffRetry({
            when: isNetworkError,
            count: Infinity,
          }),
          backoffRetry({
            when: isBackendError,
          }),
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
