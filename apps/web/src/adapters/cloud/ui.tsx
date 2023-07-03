import type {
  WorkspaceFlavour,
  WorkspaceUISchema,
} from '@affine/env/workspace';
import { lazy } from 'react';

import { Provider } from '../shared';

const LoginCard = lazy(() =>
  import('../../components/cloud/login-card').then(({ LoginCard }) => ({
    default: LoginCard,
  }))
);

const unimplemented = () => {
  throw new Error('Cloud API Not implemented');
};

export const UI = {
  Provider,
  Header: unimplemented,
  PageDetail: unimplemented,
  PageList: unimplemented,
  NewSettingsDetail: unimplemented,
  LoginCard,
} satisfies WorkspaceUISchema<WorkspaceFlavour.AFFINE_CLOUD>;
