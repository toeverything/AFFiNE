import type { BaseReactiveYData } from './base-reactive-data';

export const proxies = new WeakMap<any, BaseReactiveYData<any, any>>();
export const flatProxies = new WeakMap<any, BaseReactiveYData<any, any>>();
