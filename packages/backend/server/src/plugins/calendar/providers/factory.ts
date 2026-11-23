import { Injectable, Logger } from '@nestjs/common';

export enum CalendarProviderName {
  Google = 'google',
  CalDAV = 'caldav',
}

export interface CalendarProviderRef {
  provider: CalendarProviderName;
}

@Injectable()
export class CalendarProviderFactory<
  TProvider extends CalendarProviderRef = CalendarProviderRef,
> {
  private readonly logger = new Logger(CalendarProviderFactory.name);
  readonly #providers = new Map<CalendarProviderName, TProvider>();

  get providers() {
    return Array.from(this.#providers.keys());
  }

  get(name: CalendarProviderName) {
    return this.#providers.get(name);
  }

  register(provider: TProvider) {
    this.#providers.set(provider.provider, provider);
    this.logger.log(`Calendar provider [${provider.provider}] registered.`);
  }

  unregister(provider: TProvider) {
    this.#providers.delete(provider.provider);
    this.logger.log(`Calendar provider [${provider.provider}] unregistered.`);
  }
}
