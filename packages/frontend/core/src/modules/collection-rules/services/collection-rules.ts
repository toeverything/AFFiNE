import { Service } from '@toeverything/infra';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  of,
  share,
  throttleTime,
} from 'rxjs';

import { FilterProvider, GroupByProvider, OrderByProvider } from '../provider';
import type { FilterParams, GroupByParams, OrderByParams } from '../types';

export class CollectionRulesService extends Service {
  constructor() {
    super();
  }

  watch(
    filters: FilterParams[],
    groupBy?: GroupByParams,
    orderBy?: OrderByParams
  ): Observable<{
    groups: {
      key: string;
      items: string[];
    }[];
    filterErrors: any[];
  }> {
    // STEP 1: FILTER
    const filterProviders = this.framework.getAll(FilterProvider);
    const filtered$: Observable<{
      filtered: Set<string>;
      filterErrors: any[]; // errors from the filter providers
    }> =
      filters.length === 0
        ? of({ filtered: new Set<string>(), filterErrors: [] })
        : combineLatest(
            filters.map(filter => {
              const provider = filterProviders.get(filter.type);
              if (!provider) {
                return of({
                  error: new Error(`Unsupported filter type: ${filter.type}`),
                });
              }
              return provider.filter$(filter).pipe(
                distinctUntilChanged((prev, curr) => {
                  return prev.isSubsetOf(curr) && curr.isSubsetOf(prev);
                }),
                catchError(error => {
                  console.log(error);
                  return of({ error });
                })
              );
            })
          ).pipe(
            map(results => {
              const finalSet = results.reduce((acc, result) => {
                if ('error' in acc) {
                  return acc;
                }
                if ('error' in result) {
                  return acc;
                }
                return acc.intersection(result);
              });

              return {
                filtered: 'error' in finalSet ? new Set<string>() : finalSet,
                filterErrors: results.map(i => ('error' in i ? i.error : null)),
              };
            })
          );

    // STEP 2: ORDER BY
    const orderByProvider = orderBy
      ? this.framework.getOptional(OrderByProvider(orderBy.type))
      : null;
    const ordered$: Observable<{
      ordered: string[];
      filtered: Set<string>;
      filterErrors: any[];
    }> = filtered$.pipe(last$ => {
      if (orderBy && orderByProvider) {
        const shared$ = last$.pipe(share());
        const items$ = shared$.pipe(
          map(i => i.filtered),
          // avoid re-ordering the same items
          distinctUntilChanged((prev, curr) => {
            return prev.isSubsetOf(curr) && curr.isSubsetOf(prev);
          })
        );
        return combineLatest([
          orderByProvider.orderBy$(items$, orderBy),
          shared$,
        ]).pipe(
          map(([ordered, last]) => {
            return {
              ordered: Array.from(ordered),
              ...last,
            };
          })
        );
      }
      return last$.pipe(
        map(last => ({
          ordered: Array.from(last.filtered),
          ...last,
        }))
      );
    });

    // STEP 3: GROUP BY
    const groupByProvider = groupBy
      ? this.framework.getOptional(GroupByProvider(groupBy.type))
      : null;
    const grouped$: Observable<{
      grouped: Map<string, Set<string>>;
      ordered: string[];
      filtered: Set<string>;
      filterErrors: any[];
    }> = ordered$.pipe(last$ => {
      if (groupBy && groupByProvider) {
        const shared$ = last$.pipe(share());
        const items$ = shared$.pipe(
          map(i => i.filtered),
          // avoid re-grouping the same items
          distinctUntilChanged((prev, curr) => {
            return prev.isSubsetOf(curr) && curr.isSubsetOf(prev);
          })
        );
        return combineLatest([
          groupByProvider.groupBy$(items$, groupBy),
          shared$,
        ]).pipe(
          map(([grouped, last]) => {
            return {
              grouped: grouped,
              ...last,
            };
          })
        );
      }
      return last$.pipe(
        map(last => ({
          grouped: new Map<string, Set<string>>([['', last.filtered]]),
          ...last,
        }))
      );
    });

    // STEP 4: Merge the results
    const final$: Observable<{
      groups: {
        key: string;
        items: string[];
      }[];
      filterErrors: any[];
    }> = grouped$.pipe(
      throttleTime(500), // throttle the results to avoid too many re-renders
      map(({ grouped, ordered, filtered, filterErrors }) => {
        const result: { key: string; items: string[] }[] = [];

        function addToResult(key: string, item: string) {
          const existing = result.find(i => i.key === key);
          if (existing) {
            existing.items.push(item);
          } else {
            result.push({ key: key, items: [item] });
          }
        }

        // this step ensures that all filtered items are present in ordered
        const finalOrdered = new Set(ordered.concat(Array.from(filtered)));

        for (const item of finalOrdered) {
          const included = filtered.has(item);
          if (!included) {
            continue;
          }

          const groups: string[] = [];
          for (const [group, items] of grouped) {
            if (items.has(item)) {
              groups.push(group);
            }
          }

          if (groups.length === 0) {
            // ungrouped items
            addToResult('', item);
          } else {
            for (const group of groups) {
              addToResult(group, item);
            }
          }
        }

        return { groups: result, filterErrors };
      })
    );

    return final$;
  }
}
