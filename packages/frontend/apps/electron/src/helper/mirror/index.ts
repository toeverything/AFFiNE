import {
  abortGeneration,
  beginGeneration,
  finalizeGeneration,
  inspectTarget,
  revealMirror,
  selectProjectDirectory,
  writeBatch,
} from './mirror';

export const mirrorHandlers = {
  selectProjectDirectory,
  inspectTarget,
  beginGeneration,
  abortGeneration,
  writeBatch,
  finalizeGeneration,
  revealMirror,
};
