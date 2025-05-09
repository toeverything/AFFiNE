import { createIdentifier } from '@toeverything/infra';
import type { Observable } from 'rxjs';

import type { FilterParams, GroupByParams, OrderByParams } from '../types';

export interface FilterProvider {
  filter$(params: FilterParams): Observable<Set<string>>;
}

export const FilterProvider =
  createIdentifier<FilterProvider>('FilterProvider');

export interface GroupByProvider {
  groupBy$(
    items$: Observable<Set<string>>,
    params: GroupByParams
  ): Observable<Map<string, Set<string>>>;
}

export const GroupByProvider =
  createIdentifier<GroupByProvider>('GroupByProvider');

export interface OrderByProvider {
  orderBy$(
    items$: Observable<Set<string>>,
    params: OrderByParams
  ): Observable<string[]>;
}

export const OrderByProvider =
  createIdentifier<OrderByProvider>('OrderByProvider');
