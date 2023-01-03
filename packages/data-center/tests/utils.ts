import { Signal } from '@blocksuite/store';

export const getDataCenter = async () => {
  const dataCenter = await import('../src/index.js');
  return await dataCenter.getDataCenter(false);
};

export const waitOnce = <T>(signal: Signal<T>) =>
  new Promise<T>(resolve => signal.once(val => resolve(val)));
