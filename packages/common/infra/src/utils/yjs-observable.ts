import { distinctUntilChanged, Observable, of, switchMap } from 'rxjs';
import {
  AbstractType as YAbstractType,
  Array as YArray,
  Map as YMap,
} from 'yjs';

/**
 *
 * @param path key.[0].key2.[1]
 */
function parsePath(path: string): (string | number)[] {
  const parts = path.split('.');
  return parts.map(part => {
    if (part.startsWith('[') && part.endsWith(']')) {
      const index = parseInt(part.slice(1, -1), 10);
      if (isNaN(index)) {
        throw new Error(`index: ${part} is not a number`);
      }
      return index;
    }
    return part;
  });
}

function _yjsDeepWatch(
  target: any,
  path: ReturnType<typeof parsePath>
): Observable<unknown | undefined> {
  if (path.length === 0) {
    return of(target);
  }
  const current = path[0];

  if (target instanceof YArray || target instanceof YMap) {
    return new Observable(subscriber => {
      const refresh = () => {
        if (typeof current === 'number' && target instanceof YArray) {
          subscriber.next(target.get(current));
        } else if (typeof current === 'string' && target instanceof YMap) {
          subscriber.next(target.get(current));
        } else {
          subscriber.next(undefined);
        }
      };
      refresh();
      target.observe(refresh);
      return () => {
        target.unobserve(refresh);
      };
    }).pipe(
      distinctUntilChanged(),
      switchMap(arr => _yjsDeepWatch(arr, path.slice(1)))
    );
  } else {
    return of(undefined);
  }
}

/**
 * extract data from yjs type based on path, and return an observable.
 * observable will automatically update when yjs data changed.
 * if data is not exist on path, the observable will emit undefined.
 *
 * this function is optimized for deep watch performance.
 *
 * @example
 * yjsObserveByPath(yjs, 'pages.[0].id') -> only emit when pages[0].id changed
 * yjsObserveByPath(yjs, 'pages.[0]').switchMap(yjsObserve) -> emit when any of pages[0] or its children changed
 * yjsObserveByPath(yjs, 'pages.[0]').switchMap(yjsObserveDeep) -> emit when pages[0] or any of its deep children changed
 */
export function yjsObserveByPath(yjs: YAbstractType<any>, path: string) {
  const parsedPath = parsePath(path);
  return _yjsDeepWatch(yjs, parsedPath);
}

/**
 * convert yjs type to observable.
 * observable will automatically update when yjs data changed.
 *
 * @example
 * yjsObserveDeep(yjs) -> emit when any of its deep children changed
 */
export function yjsObserveDeep(yjs?: any) {
  return new Observable(subscriber => {
    const refresh = () => {
      subscriber.next(yjs);
    };
    refresh();
    if (yjs instanceof YAbstractType) {
      yjs.observeDeep(refresh);
      return () => {
        yjs.unobserveDeep(refresh);
      };
    }
    return;
  });
}

/**
 * convert yjs type to observable.
 * observable will automatically update when yjs data changed.
 *
 * @example
 * yjsObserveDeep(yjs) -> emit when any of children changed
 */
export function yjsObserve(yjs?: any) {
  return new Observable(subscriber => {
    const refresh = () => {
      subscriber.next(yjs);
    };
    refresh();
    if (yjs instanceof YAbstractType) {
      yjs.observe(refresh);
      return () => {
        yjs.unobserve(refresh);
      };
    }
    return;
  });
}
