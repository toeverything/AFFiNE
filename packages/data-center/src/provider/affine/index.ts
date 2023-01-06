import assert from 'assert';
import { applyUpdate, Doc } from 'yjs';

import type {
  ConfigStore,
  DataCenterSignals,
  InitialParams,
  Logger,
} from '../index.js';
import { token, Callback, getApis } from '../../apis/index.js';
import { LocalProvider } from '../local/index.js';

import { WebsocketProvider } from './sync.js';
import { IndexedDBProvider } from '../local/indexeddb.js';

export class AffineProvider extends LocalProvider {
  static id = 'affine';
  private _onTokenRefresh?: Callback = undefined;
  private _ws?: WebsocketProvider;

  constructor() {
    super();
  }

  async init(params: InitialParams) {
    super.init(params);

    this._onTokenRefresh = () => {
      if (token.refresh) {
        this._config.set('token', token.refresh);
      }
    };
    assert(this._onTokenRefresh);

    token.onChange(this._onTokenRefresh);

    // initial login token
    if (token.isExpired) {
      try {
        const refreshToken = await this._config.get('token');
        await token.refreshToken(refreshToken);

        if (token.refresh) {
          this._config.set('token', token.refresh);
        }

        assert(token.isLogin);
      } catch (_) {
        this._logger('Authorization failed, fallback to local mode');
      }
    } else {
      this._config.set('token', token.refresh);
    }
  }

  async destroy() {
    if (this._onTokenRefresh) {
      token.offChange(this._onTokenRefresh);
    }
    this._ws?.disconnect();
  }

  async initData() {
    const databases = await indexedDB.databases();
    await super.initData(
      // set locally to true if exists a same name db
      databases
        .map(db => db.name)
        .filter(v => v)
        .includes(this._workspace.room)
    );

    const workspace = this._workspace;
    const doc = workspace.doc;

    this._logger(`Login: ${token.isLogin}`);

    if (workspace.room && token.isLogin) {
      try {
        // init data from cloud
        await AffineProvider._initCloudDoc(
          workspace.room,
          doc,
          this._logger,
          this._signals
        );

        // Wait for ws synchronization to complete, otherwise the data will be modified in reverse, which can be optimized later
        this._ws = new WebsocketProvider('/', workspace.room, doc);
        await new Promise<void>((resolve, reject) => {
          // TODO: synced will also be triggered on reconnection after losing sync
          // There needs to be an event mechanism to emit the synchronization state to the upper layer
          assert(this._ws);
          this._ws.once('synced', () => resolve());
          this._ws.once('lost-connection', () => resolve());
          this._ws.once('connection-error', () => reject());
        });
        this._signals.listAdd.emit({
          workspace: workspace.room,
          provider: this.id,
          locally: true,
        });
      } catch (e) {
        this._logger('Failed to init cloud workspace', e);
      }
    }

    // if after update, the space:meta is empty
    // then we need to get map with doc
    // just a workaround for yjs
    doc.getMap('space:meta');
  }

  private static async _initCloudDoc(
    workspace: string,
    doc: Doc,
    logger: Logger,
    signals: DataCenterSignals
  ) {
    const apis = getApis();
    logger(`Loading ${workspace}...`);
    const updates = await apis.downloadWorkspace(workspace);
    if (updates) {
      await new Promise(resolve => {
        doc.once('update', resolve);
        applyUpdate(doc, new Uint8Array(updates));
      });
      logger(`Loaded: ${workspace}`);

      // only add to list as online workspace
      signals.listAdd.emit({
        workspace,
        provider: this.id,
        // at this time we always download full workspace
        // but after we support sub doc, we can only download metadata
        locally: false,
      });
    }
  }

  static async auth(
    config: Readonly<ConfigStore<string>>,
    logger: Logger,
    signals: DataCenterSignals
  ) {
    const refreshToken = await config.get('token');
    if (refreshToken) {
      await token.refreshToken(refreshToken);
      if (token.isLogin && !token.isExpired) {
        logger('check login success');
        // login success
        return;
      }
    }

    logger('start login');
    // login with google
    const apis = getApis();
    assert(apis.signInWithGoogle);
    const user = await apis.signInWithGoogle();
    assert(user);
    logger(`login success: ${user.displayName}`);

    // TODO: refresh local workspace data
    const workspaces = await apis.getWorkspaces();
    await Promise.all(
      workspaces.map(async ({ id }) => {
        const doc = new Doc();
        const idb = new IndexedDBProvider(id, doc);
        await idb.whenSynced;
        await this._initCloudDoc(id, doc, logger, signals);
      })
    );
  }
}
