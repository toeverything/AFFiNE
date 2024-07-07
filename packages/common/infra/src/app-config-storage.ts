import { z } from 'zod';

export const appConfigSchema = z.object({
  /** whether to show onboarding first */
  onBoarding: z.boolean().optional().default(true),
  /** persisted app tabs view meta */
  tabViewsMeta: z
    .object({
      activeWorkbenchKey: z.string().optional(),
      workbenches: z
        .array(
          z.object({
            key: z.string(),
            activeViewIndex: z.number().optional(),
            pinned: z.boolean().optional(),
            views: z.array(
              z.object({
                id: z.string(),
                url: z.string(),
                title: z.string(),
                moduleName: z.enum([
                  'trash',
                  'all',
                  'collection',
                  'tag',
                  'doc',
                  'journal',
                ]),
              })
            ),
          })
        )
        .default([]),
    })
    .optional(),
});

export type AppConfigSchema = z.infer<typeof appConfigSchema>;
export type TabViewsMetaSchema = NonNullable<AppConfigSchema['tabViewsMeta']>;
export const defaultAppConfig = appConfigSchema.parse({});

const _storage: Record<number, any> = {};
let _inMemoryId = 0;

interface StorageOptions<T> {
  /** default config */
  config: T;
  get?: () => T;
  set?: (data: T) => void;
}

/**
 * Storage for app configuration, stored in memory by default
 */
class Storage<T extends object> {
  private _cfg: T;
  private readonly _id = _inMemoryId++;
  private readonly _options;

  constructor(options: StorageOptions<T>) {
    this._options = {
      get: () => _storage[this._id],
      set: (data: T) => (_storage[this._id] = data),
      ...options,
    };
    this._cfg = this.get() ?? options.config;
  }

  /**
   * update entire config
   * @param data
   */
  set(data: T) {
    try {
      this._options.set(data);
    } catch (err) {
      console.error('failed to save config', err);
    }
    this._cfg = data;
  }

  get(): T;
  get<K extends keyof T>(key: K): T[K];
  /**
   * get config, if key is provided, return the value of the key
   * @param key
   * @returns
   */
  get(key?: keyof T): T | T[keyof T] {
    if (!key) {
      try {
        const cfg = this._options.get();
        if (!cfg) {
          this.set(this._options.config);
          return this._options.config;
        }
        return cfg;
      } catch (err) {
        return this._cfg;
      }
    } else {
      const fullConfig = this.get();
      // TODO(@catsjuice): handle key not found, set default value
      // if (!(key in fullConfig)) {}
      return fullConfig[key];
    }
  }

  /**
   * update a key in config
   * @param key
   * @param value
   */
  patch(key: keyof T, value: any) {
    this.set({ ...this.get(), [key]: value });
  }

  get value(): T {
    return this.get();
  }
}

export class AppConfigStorage extends Storage<AppConfigSchema> {}
