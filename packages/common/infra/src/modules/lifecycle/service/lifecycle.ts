import { createEvent, Service } from '../../../framework';

export const ApplicationStarted = createEvent<boolean>('ApplicationStartup');

export class LifecycleService extends Service {
  constructor() {
    super();
  }

  applicationStart() {
    this.eventBus.emit(ApplicationStarted, true);
  }
}
