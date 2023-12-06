import type { TypedEventEmitter } from '@toeverything/infra/core/event-emitter';
import EventEmitter from 'events';

export type MainEvents = {
  'window:main:open': () => void;
  'window:onboarding:close': () => void;
};

export const eventEmitter =
  new EventEmitter() as unknown as TypedEventEmitter<MainEvents>;
