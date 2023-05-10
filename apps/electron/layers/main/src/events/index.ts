export * from './register';

import { applicationMenuSubjects } from './application-menu';
import { dbSubjects } from './db';

export const subjects = {
  db: dbSubjects,
  applicationMenu: applicationMenuSubjects,
};
