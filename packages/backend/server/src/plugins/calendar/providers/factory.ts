import { Injectable, Logger } from '@nestjs/common';

import type { CalendarProvider } from './def';
import { CalendarProviderName } from './def';

@Injectable()
export class CalendarProviderFactory {
  private readonly logger = new Logger(CalendarProviderFactory.name);
  readonly #providers = new Map<CalendarProviderName, CalendarProvider>();

  get providers() {
    return Array.from(this.#providers.keys());
  }

  get(name: CalendarProviderName) {
    return this.#providers.get(name);
  }

  register(provider: CalendarProvider) {
    this.#providers.set(provider.provider, provider);
    this.logger.log(`Calendar provider [${provider.provider}] registered.`);
  }

  unregister(provider: CalendarProvider) {
    this.#providers.delete(provider.provider);
    this.logger.log(`Calendar provider [${provider.provider}] unregistered.`);
  }
}
