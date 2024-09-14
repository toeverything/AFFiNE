import { notify } from '@affine/component';
import { openSettingModalAtom } from '@affine/core/components/atoms';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { debounce } from 'lodash-es';
import { useCallback, useEffect } from 'react';

/**
 * TODO(eyhn): refactor this
 */
export const OverCapacityNotification = () => {
  const t = useI18n();
  const currentWorkspace = useService(WorkspaceService).workspace;
  const permissionService = useService(WorkspacePermissionService);
  const isOwner = useLiveData(permissionService.permission.isOwner$);
  useEffect(() => {
    // revalidate permission
    permissionService.permission.revalidate();
  }, [permissionService]);

  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const jumpToPricePlan = useCallback(() => {
    setSettingModalAtom({
      open: true,
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
  }, [setSettingModalAtom]);

  // debounce sync engine status
  useEffect(() => {
    const disposableOverCapacity =
      currentWorkspace.engine.blob.isStorageOverCapacity$.subscribe(
        debounce((isStorageOverCapacity: boolean) => {
          const isOver = isStorageOverCapacity;
          if (!isOver) {
            return;
          }
          if (isOwner) {
            notify.warning({
              title: t['com.affine.payment.storage-limit.title'](),
              message:
                t['com.affine.payment.storage-limit.description.owner'](),
              action: {
                label: t['com.affine.payment.storage-limit.view'](),
                onClick: jumpToPricePlan,
              },
            });
          } else {
            notify.warning({
              title: t['com.affine.payment.storage-limit.title'](),
              message:
                t['com.affine.payment.storage-limit.description.member'](),
            });
          }
        })
      );
    return () => {
      disposableOverCapacity?.unsubscribe();
    };
  }, [currentWorkspace, isOwner, jumpToPricePlan, t]);

  return null;
};
