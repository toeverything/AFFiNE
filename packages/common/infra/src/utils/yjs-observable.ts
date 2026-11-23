import { distinctUntilChanged, Observable, of, switchMap } from 'rxjs';
import {
  AbstractType as YAbstractType,
  Array as YArray,
  Map as YMap,
  YArrayEvent,
  type YEvent,
  YMapEvent,
} from 'yjs';

/**
 *
 * @param path key.[0].key2.[1]
 */
function parsePath(path: string): (string | number)[] {
  const parts = path.split('.');
  return parts.map(part => {
    if (part.startsWith('[') && part.endsWith(']')) {
      const token = part.slice(1, -1);
      if (token === '*') {
        return '*';
      }
      const index = parseInt(token, 10);
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
 * yjsGetPath(yjs, 'pages.[0].id') -> get pages[0].id and emit when changed
 * yjsGetPath(yjs, 'pages.[0]').switchMap(yjsObserve) -> get pages[0] and emit when any of pages[0] or its children changed
 * yjsGetPath(yjs, 'pages.[0]').switchMap(yjsObserveDeep) -> get pages[0] and emit when pages[0] or any of its deep children changed
 */
export function yjsGetPath(yjs: YAbstractType<any>, path: string) {
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
 * observable will automatically update when data changed on the path.
 *
 * @example
 * yjsObservePath(yjs, 'pages.[0].id') -> only emit when pages[0].id changed
 * yjsObservePath(yjs, 'pages.*.tags') -> only emit when tags of any page changed
 */
export function yjsObservePath(yjs?: any, path?: string) {
  const parsedPath = path ? parsePath(path) : [];

  return new Observable(subscriber => {
    const refresh = (event?: YEvent<any>[]) => {
      if (!event) {
        subscriber.next(yjs);
        return;
      }

      const changedPaths: (string | number)[][] = [];
      event.forEach(e => {
        if (e instanceof YArrayEvent) {
          changedPaths.push(e.path);
        } else if (e instanceof YMapEvent) {
          for (const key of e.keysChanged) {
            changedPaths.push([...e.path, key]);
          }
        }
      });

      for (const changedPath of changedPaths) {
        let changed = true;
        for (let i = 0; i < parsedPath.length; i++) {
          const changedKey = changedPath[i];
          const parsedKey = parsedPath[i];
          if (changedKey === undefined) {
            changed = true;
            break;
          }

          if (parsedKey === undefined) {
            changed = true;
            break;
          }

          if (changedKey === parsedKey) {
            continue;
          }

          if (parsedKey === '*') {
            continue;
          }

          changed = false;
          break;
        }

        if (changed) {
          subscriber.next(yjs);
          return;
        }
      }
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
 * yjsObserve(yjs) -> emit when yjs type changed
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
