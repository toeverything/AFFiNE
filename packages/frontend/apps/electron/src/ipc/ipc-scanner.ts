import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { Observable } from 'rxjs';

import { isDev } from '../shared/constants';
import { IPC_EVENT_META_KEY } from './ipc-event';
import { IPC_HANDLE_META_KEY } from './ipc-handle';

@Injectable()
export class IpcScanner {
  constructor(
    private readonly discover: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly logger: Logger
  ) {}

  scanHandlers() {
    const providers = this.discover.getProviders().filter(p => p.metatype);
    const handlers: Map<string, (...args: any[]) => any> = new Map();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (
        !instance ||
        typeof instance !== 'object' ||
        !Object.getPrototypeOf(instance)
      )
        continue;

      const proto = Object.getPrototypeOf(instance);
      const methodNames = this.scanner.getAllMethodNames(proto);

      const processCandidate = (
        method: (...args: any[]) => any,
        _key: string | symbol
      ) => {
        const channel = Reflect.getMetadata(IPC_HANDLE_META_KEY, method);
        if (!channel) return;

        if (isDev && handlers.has(channel)) {
          this.logger.warn(`Duplicate IPC handle for ${channel}`);
        }

        handlers.set(channel, method.bind(instance));
      };

      // Process prototype methods
      for (const key of methodNames) {
        const method = (instance as any)[key];
        if (typeof method !== 'function') continue;
        processCandidate(method, key);
      }

      // Additionally process own enumerable properties (arrow functions, etc.)
      for (const key of Object.getOwnPropertyNames(instance)) {
        if (methodNames.includes(key)) continue; // already processed
        const candidate = (instance as any)[key];
        if (typeof candidate !== 'function') continue;
        processCandidate(candidate, key);
      }
    }

    return handlers;
  }

  scanEventSources() {
    const providers = this.discover
      .getProviders()
      .filter(wrapper => wrapper.instance);
    const eventSources = new Map<string, Observable<any>>();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') continue;

      for (const propertyKey of Object.getOwnPropertyNames(instance)) {
        const eventSourceCandidate = (instance as any)[propertyKey];
        if (
          !eventSourceCandidate ||
          typeof eventSourceCandidate.subscribe !== 'function'
        ) {
          continue;
        }

        const eventMeta = Reflect.getMetadata(
          IPC_EVENT_META_KEY,
          instance,
          propertyKey
        );
        if (!eventMeta || !eventMeta.channel) {
          continue;
        }

        if (isDev && eventSources.has(eventMeta.channel)) {
          this.logger.warn(
            `Duplicate IPC event source for ${eventMeta.channel}`
          );
        }

        eventSources.set(
          eventMeta.channel,
          eventSourceCandidate as Observable<any>
        );
      }
    }

    return eventSources;
  }
}
