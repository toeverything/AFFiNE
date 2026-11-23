import {
  type DocPermissionActions,
  type WorkspacePermissionActions,
} from '@affine/core/modules/permissions';
import type React from 'react';

import { useGuard } from './use-guard';

export const Guard = <
  T extends WorkspacePermissionActions | DocPermissionActions,
>(
  props: {
    permission: T;
    children: (can: boolean | undefined) => React.ReactNode;
  } & (T extends DocPermissionActions ? { docId: string } : {})
) => {
  const { permission, children, ...rest } = props;
  const docId = 'docId' in rest ? [rest.docId] : [];
  const can = useGuard(permission, ...(docId as any));

  if (typeof children === 'function') {
    return children(can);
  }
  throw new Error('children must be a function');
};
