/**
 *
 * **SyncEngine**
 *
 * Manages one local storage and multiple remote storages.
 *
 * Responsible for creating SyncPeers for synchronization, following the local-first strategy.
 *
 * **SyncPeer**
 *
 * Responsible for synchronizing a single storage with Y.Doc.
 *
 * Carries the main synchronization logic.
 *
 */

export * from './consts';
export * from './engine';
export * from './peer';
export * from './storage';
