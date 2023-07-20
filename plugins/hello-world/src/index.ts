import {
  currentWorkspaceIdAtom,
  rootStore,
} from '@toeverything/plugin-infra/manager';

console.log('hello, world!');

console.log(rootStore.get(currentWorkspaceIdAtom));
