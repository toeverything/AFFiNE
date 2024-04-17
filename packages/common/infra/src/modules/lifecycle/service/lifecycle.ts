import { createEvent, Service } from '../../../framework';

/**
 * Event that is emitted when application is started.
 */
export const ApplicationStarted = createEvent<boolean>('ApplicationStartup');

/**
 * Event that is emitted when browser tab or windows is focused again, after being blurred.
 * Can be used to actively refresh some data.
 */
export const ApplicationFocused = createEvent<boolean>('ApplicationFocused');

export class LifecycleService extends Service {
  constructor() {
    super();
  }

  applicationStart() {
    this.eventBus.emit(ApplicationStarted, true);
  }

  applicationFocus() {
    this.eventBus.emit(ApplicationFocused, true);
  }
}
