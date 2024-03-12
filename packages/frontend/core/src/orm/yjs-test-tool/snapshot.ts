import type { Doc } from 'yjs';
import { Array as YArray, Map as YMap, Text as YText } from 'yjs';

type DataMap = {
  yarray: {
    list: JSONData[];
  };
  ymap: {
    props: Record<string, JSONData>;
  };
  ytext: {
    text: string;
  };
  array: {
    list: JSONData[];
  };
  object: {
    props: Record<string, JSONData>;
  };
  literal: {
    value: string | number | boolean | null;
  };
};
export type JSONData = {
  [K in keyof DataMap]: {
    type: K;
  } & DataMap[K];
}[keyof DataMap];
export type Snapshot = Record<string, JSONData>;
type Node = number | string;
export type Path = [string, ...Node[]] | string;
const getData = (doc: Doc, path: Path) => {
  const [rootPath, ...pathList] = Array.isArray(path) ? path : [path];
  let data: unknown = doc.get(rootPath);
  for (const path of pathList) {
    if (typeof path === 'string' && data instanceof YMap) {
      data = data.get(path);
    } else if (typeof path === 'number' && data instanceof YArray) {
      data = data.get(path);
    } else if (typeof path === 'number' && Array.isArray(data)) {
      data = data[path];
    } else if (
      typeof path === 'string' &&
      typeof data === 'object' &&
      data != null
    ) {
      data = (data as Record<string, unknown>)[path];
    } else {
      return undefined;
    }
  }
  return [rootPath, data];
};
type Result<T> =
  | {
      type: 'ok';
      data: T;
    }
  | {
      type: 'error';
      message?: string;
    };
const ok = <T>(data: T): Result<T> => {
  return {
    type: 'ok',
    data,
  };
};
const next: Result<never> = {
  type: 'error',
};
const convertMap: {
  [K in keyof DataMap]: {
    to: (data: unknown) => Result<DataMap[K]>;
    from: (json: DataMap[K]) => unknown;
  };
} = {
  ymap: {
    to: data => {
      if (!(data instanceof YMap)) {
        return next;
      }
      const props = Object.fromEntries(
        [...data.entries()].map(([key, value]) => [key, toJSON(value)])
      );
      return ok({ props });
    },
    from: data =>
      new YMap(
        Object.entries(data.props).map(([key, value]) => [key, fromJSON(value)])
      ),
  },
  yarray: {
    to: data => {
      if (!(data instanceof YArray)) {
        return next;
      }
      return ok({ list: [...data].map(toJSON) });
    },
    from: data => {
      const list = data.list.map(v => fromJSON(v) as any);
      console.log(list);
      return YArray.from(list);
    },
  },
  ytext: {
    to: data => {
      if (!(data instanceof YText)) {
        return next;
      }
      return ok({ text: data.toString() });
    },
    from: data => new YText(data.text),
  },
  array: {
    to: data => {
      if (!Array.isArray(data)) {
        return next;
      }
      return ok({ list: data.map(toJSON) });
    },
    from: data => data.list.map(fromJSON),
  },
  object: {
    to: data => {
      if (typeof data !== 'object' || data == null) {
        return next;
      }
      const props = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, toJSON(value)])
      );
      return ok({ props });
    },
    from: data =>
      Object.fromEntries(
        Object.entries(data.props).map(([key, value]) => [key, fromJSON(value)])
      ),
  },
  literal: {
    to: data => {
      if (
        typeof data !== 'string' &&
        typeof data !== 'number' &&
        typeof data !== 'boolean' &&
        data !== null
      ) {
        return next;
      }
      return ok({ value: data });
    },
    from: data => data.value,
  },
};
const toJsonList = Object.entries(convertMap).map(([key, value]) => {
  return {
    key,
    ...value,
  };
});
const toJSON = (data: unknown): JSONData => {
  for (const v of toJsonList) {
    const result = v.to(data);
    if (result.type === 'ok') {
      return {
        type: v.key,
        ...result.data,
      } as JSONData;
    }
  }
  throw new Error('Unknown type');
};
const fromJSON = (json: JSONData): unknown => {
  const v = convertMap[json.type];
  if (v == null) {
    throw new Error('Unknown type');
  }
  return v.from(json as any);
};
const notNull = <T>(value: T | null | undefined): value is T => value != null;
export const toSnapshot = (doc: Doc, ...paths: Path[]) => {
  return Object.fromEntries(
    paths
      .map(path => {
        const result = getData(doc, path);
        if (!result) {
          return undefined;
        }
        const [rootPath, data] = result;
        return [rootPath, toJSON(data)] as const;
      })
      .filter(notNull)
  );
};
export const fromSnapshot = (doc: Doc, snapshot: Record<string, JSONData>) => {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value.type === 'yarray') {
      doc.getArray(key).push(value.list.map(v => fromJSON(v)));
    } else if (value.type === 'ymap') {
      Object.entries(value).forEach(([k, value]) => {
        doc.getMap(key).set(k, value);
      });
    }
  }
};
