import type { WorkspaceUISchema } from '@affine/env/workspace';
import { lazy } from 'react';

import { Provider } from '../shared';

const LoginCard = lazy(() =>
  import('../../components/cloud/login-card').then(({ LoginCard }) => ({
    default: LoginCard,
  }))
);

export const UI = {
  Provider,
  LoginCard,
} satisfies WorkspaceUISchema;
