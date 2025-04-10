export { NotificationCountService } from './services/count';
export { NotificationListService } from './services/list';
export { NotificationService } from './services/notification';
export type { Notification, NotificationBody } from './stores/notification';
export { NotificationType } from './stores/notification';

import type { Framework } from '@toeverything/infra';

import {
  AuthService,
  GraphQLService,
  ServerScope,
  ServerService,
} from '../cloud';
import { GlobalSessionState } from '../storage';
import { NotificationCountService } from './services/count';
import { NotificationListService } from './services/list';
import { NotificationService } from './services/notification';
import { NotificationStore } from './stores/notification';

export function configureNotificationModule(framework: Framework) {
  framework
    .scope(ServerScope)
    .service(NotificationService, [NotificationStore])
    .service(NotificationCountService, [NotificationStore, AuthService])
    .service(NotificationListService, [
      NotificationStore,
      NotificationCountService,
    ])
    .store(NotificationStore, [
      GraphQLService,
      ServerService,
      GlobalSessionState,
    ]);
}
