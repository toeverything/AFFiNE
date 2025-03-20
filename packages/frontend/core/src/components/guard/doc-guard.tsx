import {
  type DocPermissionActions,
  GuardService,
} from '@affine/core/modules/permissions';
import { useLiveData, useService } from '@toeverything/infra';
import type React from 'react';

export const DocPermissionGuard = ({
  docId,
  children,
  permission,
}: {
  docId: string;
  permission: DocPermissionActions;
  children: (can: boolean | undefined) => React.ReactNode;
}) => {
  const guardService = useService(GuardService);
  const can = useLiveData(guardService.can$(permission, docId));

  if (typeof children === 'function') {
    return children(can);
  }
  throw new Error('children must be a function');
};
