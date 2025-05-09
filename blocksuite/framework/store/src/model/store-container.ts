import type {
  Doc,
  ExtensionType,
  GetStoreOptions,
  RemoveStoreOptions,
} from '../extension';
import { DocIdentifier } from '../extension/workspace';
import { type Query, Store } from './store';

export class StoreContainer {
  private readonly _storeMap = new Map<string, Store>();

  constructor(readonly doc: Doc) {}

  getStore = ({
    readonly,
    query,
    provider,
    extensions,
    id,
  }: GetStoreOptions = {}) => {
    let idOrOptions: string | { readonly?: boolean; query?: Query };
    if (readonly || query) {
      idOrOptions = { readonly, query };
    } else if (!id) {
      idOrOptions = this.doc.workspace.idGenerator();
    } else {
      idOrOptions = id;
    }
    const key = this._getQueryKey(idOrOptions);

    if (this._storeMap.has(key)) {
      return this._storeMap.get(key) as Store;
    }

    const storeExtension: ExtensionType = {
      setup: di => {
        di.addImpl(DocIdentifier, () => this.doc);
      },
    };

    const doc = new Store({
      doc: this.doc,
      readonly,
      query,
      provider,
      extensions: [storeExtension].concat(extensions ?? []),
    });

    this._storeMap.set(key, doc);

    return doc;
  };

  removeStore = ({ readonly, query, id }: RemoveStoreOptions) => {
    let idOrOptions: string | { readonly?: boolean; query?: Query };
    if (readonly || query) {
      idOrOptions = { readonly, query };
    } else if (!id) {
      return;
    } else {
      idOrOptions = id;
    }
    const key = this._getQueryKey(idOrOptions);
    this._storeMap.delete(key);
  };

  private readonly _getQueryKey = (
    idOrOptions: string | { readonly?: boolean; query?: Query }
  ) => {
    if (typeof idOrOptions === 'string') {
      return idOrOptions;
    }
    const { readonly, query } = idOrOptions;
    const readonlyKey = this._getReadonlyKey(readonly);
    const key = JSON.stringify({
      readonlyKey,
      query,
    });
    return key;
  };

  private _getReadonlyKey(readonly?: boolean): 'true' | 'false' {
    return (readonly?.toString() as 'true' | 'false') ?? 'false';
  }
}
