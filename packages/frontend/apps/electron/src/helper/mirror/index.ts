import {
  abortGeneration,
  beginGeneration,
  finalizeGeneration,
  inspectTarget,
  revealMirror,
  scanTarget,
  scanVersion1Migration,
  selectProjectDirectory,
  writeBatch,
} from './mirror';
import { startMirrorWatcher, stopMirrorWatcher } from './watcher';

export { mirrorEvents } from './watcher';

export const mirrorHandlers = {
  selectProjectDirectory,
  inspectTarget,
  beginGeneration,
  abortGeneration,
  writeBatch,
  finalizeGeneration,
  revealMirror,
  scanTarget,
  scanVersion1Migration,
  startWatching: startMirrorWatcher,
  stopWatching: stopMirrorWatcher,
};
