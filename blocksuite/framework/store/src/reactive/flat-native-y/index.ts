import { signal } from '@preact/signals-core';
import type { Subject } from 'rxjs';
import { Array as YArray, type Map as YMap, type YMapEvent } from 'yjs';

import { BaseReactiveYData } from '../base-reactive-data';
import { Boxed, type OnBoxedChange } from '../boxed';
import { ReactiveYArray } from '../proxy';
import { type OnTextChange, Text } from '../text';
import type { ProxyOptions, UnRecord } from '../types';
import { initializeData } from './initialize';
import { createProxy } from './proxy';
import type { OnChange } from './types';
import { getYEventHandler } from './y-event-handler';

export class ReactiveFlatYMap extends BaseReactiveYData<
  UnRecord,
  YMap<unknown>
> {
  protected readonly _proxy: UnRecord;
  protected readonly _source: UnRecord;
  protected readonly _options?: ProxyOptions<UnRecord>;

  private readonly _initialized;

  private readonly _observer = (event: YMapEvent<unknown>) => {
    const yMap = this._ySource;
    const proxy = this._proxy;
    this._onObserve(event, () => {
      getYEventHandler({
        yMap,
        proxy,
        stashed: this._stashed,
        updateWithYjsSkip: this._updateWithYjsSkip,
        transform: this._transform,
        onChange: this._onChange,
        event,
      });
    });
  };

  private readonly _transform = (
    key: string,
    value: unknown,
    origin: unknown
  ) => {
    const onChange = this._getPropOnChange(key);
    if (value instanceof Text) {
      value.bind(onChange as OnTextChange);
      return value;
    }
    if (Boxed.is(origin)) {
      (value as Boxed).bind(onChange as OnBoxedChange);
      return value;
    }
    if (origin instanceof YArray) {
      const data = new ReactiveYArray(value as unknown[], origin, {
        onChange,
      });
      return data.proxy;
    }

    return value;
  };

  private readonly _getPropOnChange = (key: string) => {
    return (_: unknown, isLocal: boolean) => {
      this._onChange?.(key, isLocal);
    };
  };

  private _byPassYjs = false;

  private readonly _getProxy = (
    source: UnRecord,
    root: UnRecord,
    path?: string
  ): UnRecord =>
    createProxy({
      yMap: this._ySource,
      base: source,
      root,
      onDispose: this._onDispose,
      shouldByPassSignal: () => this._skipNext,
      byPassSignalUpdate: this._updateWithSkip,
      shouldByPassYjs: () => this._byPassYjs,
      basePath: path,
      onChange: this._onChange,
      transform: this._transform,
      stashed: this._stashed,
      initialized: () => this._initialized,
    });

  private readonly _updateWithYjsSkip = (fn: () => void) => {
    this._byPassYjs = true;
    fn();
    this._byPassYjs = false;
  };

  constructor(
    protected readonly _ySource: YMap<unknown>,
    private readonly _onDispose: Subject<void>,
    private readonly _onChange?: OnChange,
    defaultProps?: Record<string, unknown>
  ) {
    super();
    this._initialized = false;
    const source = initializeData({
      getProxy: this._getProxy,
      transform: this._transform,
      yMap: this._ySource,
    });
    this._source = source;

    const proxy = this._getProxy(source, source);

    const initSignals = (key: string, value: unknown) => {
      const signalData = signal(value);
      source[`${key}$`] = signalData;
      const unsubscribe = signalData.subscribe(next => {
        if (!this._initialized) {
          return;
        }
        this._updateWithSkip(() => {
          proxy[key] = next;
          this._onChange?.(key, true);
        });
      });
      const subscription = _onDispose.subscribe(() => {
        subscription.unsubscribe();
        unsubscribe();
      });
    };

    Object.entries(source).forEach(([key, value]) => {
      initSignals(key, value);
    });

    if (defaultProps) {
      Object.entries(defaultProps).forEach(([key, value]) => {
        if (!(key in proxy) && value === undefined) {
          initSignals(key, value);
        }
      });
    }

    this._proxy = proxy;
    this._ySource.observe(this._observer);
    this._initialized = true;

    if (defaultProps) {
      Object.entries(defaultProps).forEach(([key, value]) => {
        if (key in proxy || value === undefined) return;
        proxy[key] = value;
      });
    }
  }

  pop = (prop: string): void => {
    const value = this._source[prop];
    this._stashed.delete(prop);
    this._proxy[prop] = value;
  };

  stash = (prop: string): void => {
    this._stashed.add(prop);
  };
}
