import type { BroadCastChannelProvider } from '@affine/env/workspace'
import type { DocProviderCreator } from '@blocksuite/store'
import { Workspace } from '@blocksuite/store'
import type { EventBasedChannel } from 'async-call-rpc'
import { AsyncCall } from 'async-call-rpc'
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate
} from 'y-protocols/awareness'
import type { Doc } from 'yjs'

const Y = Workspace.Y

export type AwarenessChanges = Record<
  'added' | 'updated' | 'removed',
  number[]
>;


type Impl = {
  // request diff update from other clients
  diffUpdateDoc: (guid: string, clientId: number) => Promise<Uint8Array | false>

  // send update to other clients
  sendUpdateDoc: (guid: string, update: Uint8Array, clientId: number) => Promise<void>

  // request awareness from other clients
  queryAwareness: (clientId: number) => Promise<Uint8Array | false>

  // send awareness to other clients
  sendAwareness: (awarenessUpdate: Uint8Array, clientId: number) => Promise<void>
}


/**
 * BroadcastChannel support for AsyncCall.
 * Please make sure your serializer can convert JSON RPC payload into one of the following data types:
 * - Data that can be [structure cloned](http://mdn.io/structure-clone)
 */
export class BroadcastMessageChannel extends BroadcastChannel implements EventBasedChannel {
  on(eventListener: (data: unknown) => void) {
    const f = (e: MessageEvent): void => eventListener(e.data)
    this.addEventListener('message', f)
    return () => this.removeEventListener('message', f)
  }
  send(data: any) {
    super.postMessage(data)
  }
}

const docMap = new Map<string, Doc>()

export const createBroadCastChannelProvider: DocProviderCreator = (
  id,
  doc,
  config
): BroadCastChannelProvider => {
  const awareness = config.awareness
  const currentClientId = awareness.clientID
  function initDocMap(doc: Doc) {
    // register all doc into map
    docMap.set(doc.guid, doc)
    doc.subdocs.forEach(initDocMap)
  }

  const impl = {
    diffUpdateDoc: async (
      guid,
      clientId
    ) => {
      if (clientId === currentClientId) return false
      const doc = docMap.get(guid)
      if (!doc) {
        return false
      }
      return Y.encodeStateAsUpdate(doc)
    },
    sendUpdateDoc: async (
      guid,
      update,
      clientId
    ) => {
      const doc = docMap.get(guid)
      if (clientId === currentClientId) return
      if (!doc) {
        throw new Error(`cannot find doc ${guid}`)
      }
      Y.applyUpdate(doc, update)
    },
    queryAwareness: async (clientId) => {
      if (clientId === currentClientId) return false
      return encodeAwarenessUpdate(awareness, [
        awareness.clientID,
      ])
    },
    sendAwareness: async (awarenessUpdate, clientId) => {
      if (clientId === currentClientId) return
      applyAwarenessUpdate(awareness, awarenessUpdate, broadcastChannel)
    }
  } satisfies Impl

  const broadcastChannel = new BroadcastMessageChannel(id)
  const rpc = AsyncCall<Impl>(impl, {
    channel: broadcastChannel
  })

  type UpdateHandler = (
    update: Uint8Array,
    origin: any
  ) => void

  type SubdocsHandler = (
    event: {
      added: Set<Doc>
      loaded: Set<Doc>
      removed: Set<Doc>
    }
  ) => void

  const updateHandlerWeakMap = new WeakMap<Doc, UpdateHandler>()
  const subdocsHandlerWeakMap = new WeakMap<Doc, SubdocsHandler>()

  const createOrGetUpdateHandler = (doc: Doc): UpdateHandler => {
    if (updateHandlerWeakMap.has(doc)) {
      return updateHandlerWeakMap.get(doc) as UpdateHandler
    }
    const handler: UpdateHandler = (update, origin) => {
      if (origin === broadcastChannel) {
        // not self update, ignore
        return;
      }

      rpc.sendUpdateDoc(doc.guid, update, currentClientId)
        .catch(console.error)
    }
    updateHandlerWeakMap.set(doc, handler)
    return handler
  }

  const createOrGetSubdocsHandler = (doc: Doc): SubdocsHandler => {
    if (subdocsHandlerWeakMap.has(doc)) {
      return subdocsHandlerWeakMap.get(doc) as SubdocsHandler
    }

    const handler: SubdocsHandler = (event) => {
      event.added.forEach(doc => {
        initDocMap(doc)
        rpc.diffUpdateDoc(doc.guid, currentClientId)
          .then(update => {
            if (!update) {
              console.error('cannot get update for doc', doc.guid)
              return
            }
            Y.applyUpdate(doc, update, broadcastChannel)
          })
        doc.on('update', createOrGetUpdateHandler(doc))
      })
    }

    subdocsHandlerWeakMap.set(doc, handler)
    return handler
  }

  const awarenessUpdateHandler = (changes: AwarenessChanges, origin: any) => {
    if (origin === broadcastChannel) {
      return;
    }
    const changedClients = Object.values(changes).reduce((res, cur) => [
      ...res,
      ...cur,
    ]);
    const update = encodeAwarenessUpdate(awareness, changedClients);
    rpc.sendAwareness(update, currentClientId).catch(console.error);
  }

  initDocMap(doc)

  let connected = false
  return {
    flavour: 'broadcast-channel',
    passive: true,
    connect () {
      connected = true

      async function registerDoc(doc: Doc) {
        docMap.set(doc.guid, doc)
        // register subdocs
        doc.on('subdocs', createOrGetSubdocsHandler(doc))
        doc.subdocs.forEach(registerDoc)
        // register update
        doc.on('update', createOrGetUpdateHandler(doc))

        // query diff update
        const update = await rpc.diffUpdateDoc(doc.guid, currentClientId)
        if (!connected) {
          return
        }
        if (update !== false) {
          Y.applyUpdate(doc, update, broadcastChannel)
        }
      }
      registerDoc(doc).catch(console.error)
      rpc.queryAwareness(currentClientId).then(update => update && applyAwarenessUpdate(awareness, update, broadcastChannel))
      awareness.on('update', awarenessUpdateHandler)
    },
    disconnect () {
      function unregisterDoc(doc: Doc) {
        docMap.delete(doc.guid)
        doc.subdocs.forEach(unregisterDoc)
        doc.off('update', createOrGetUpdateHandler(doc))
        doc.off('subdocs', createOrGetSubdocsHandler(doc))
      }
      unregisterDoc(doc)
      awareness.off('update', awarenessUpdateHandler)
      connected = false
    },
    get connected (): boolean {
      return connected
    },
    cleanup: () => {
      broadcastChannel.close()
    }
  }
};
