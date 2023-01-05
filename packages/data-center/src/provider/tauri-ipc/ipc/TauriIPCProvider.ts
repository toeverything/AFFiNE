/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */
import * as Y from 'yjs';
import { Observable } from 'lib0/observable';
import { DocProvider } from '@blocksuite/store';
import type { Awareness } from 'y-protocols/awareness';
import { invoke } from '@tauri-apps/api';
import { updateYDocument } from './methods';

export class TauriIPCProvider
  extends Observable<string>
  implements DocProvider
{
  #yDocument: Y.Doc;
  constructor(
    room: string,
    yDocument: Y.Doc,
    options?: { awareness?: Awareness }
  ) {
    super();
    this.#yDocument = yDocument;
    this.#yDocument.on(
      'update',
      async (
        update: Uint8Array,
        origin: any,
        _yDocument: Y.Doc,
        _transaction: Y.Transaction
      ) => {
        try {
          // TODO: need handle potential data race when update is frequent?
          // TODO: update seems too frequent upon each keydown, why no batching?
          const success = await updateYDocument({
            update: Array.from(update),
            room,
          });
        } catch (error) {
          // TODO: write error log to disk, and add button to open them in settings panel
          console.error("#yDocument.on('update'", error);
        }
      }
    );
  }

  connect() {}

  destroy() {}
  disconnect() {
    // do nothing
  }

  async clearData() {}
}
