import { Signal } from '@blocksuite/store';

export const getDataCenter = () => {
  return import('../src/index.js').then(async dataCenter =>
    dataCenter.getDataCenter(false)
  );
};

export const waitOnce = <T>(signal: Signal<T>) =>
  new Promise<T>(resolve => signal.once(val => resolve(val)));
