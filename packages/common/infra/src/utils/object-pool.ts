import { Unreachable } from '@affine/env/constant';

export interface RcRef<T> {
  obj: T;
  release: () => void;
}

export class ObjectPool<Key, T> {
  objects = new Map<Key, { obj: T; rc: number }>();
  timeoutToGc: NodeJS.Timeout | null = null;

  constructor(
    private readonly options: {
      onDelete?: (obj: T) => void;
      onDangling?: (obj: T) => boolean;
    } = {}
  ) {}

  get(key: Key): RcRef<T> | null {
    const exist = this.objects.get(key);
    if (exist) {
      exist.rc++;
      let released = false;
      return {
        obj: exist.obj,
        release: () => {
          // avoid double release
          if (released) {
            return;
          }
          released = true;
          exist.rc--;
          this.requestGc();
        },
      };
    }
    return null;
  }

  put(key: Key, obj: T) {
    const ref = { obj, rc: 0 };
    this.objects.set(key, ref);

    const r = this.get(key);
    if (!r) {
      throw new Unreachable();
    }

    return r;
  }

  private requestGc() {
    if (this.timeoutToGc) {
      clearInterval(this.timeoutToGc);
    }

    // do gc every 1s
    this.timeoutToGc = setInterval(() => {
      this.gc();
    }, 1000);
  }

  private gc() {
    for (const [key, { obj, rc }] of new Map(
      this.objects /* clone the map, because the origin will be modified during iteration */
    )) {
      if (
        rc === 0 &&
        (!this.options.onDangling || this.options.onDangling(obj))
      ) {
        this.options.onDelete?.(obj);

        this.objects.delete(key);
      }
    }

    for (const [_, { rc }] of this.objects) {
      if (rc === 0) {
        return;
      }
    }

    // if all object has referrer, stop gc
    if (this.timeoutToGc) {
      clearInterval(this.timeoutToGc);
    }
  }

  clear() {
    for (const { obj } of this.objects.values()) {
      this.options.onDelete?.(obj);
    }

    this.objects.clear();
  }
}
