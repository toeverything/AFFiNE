import { ConfirmModal } from '@affine/component';
import { WorkspacePropertiesAdapter } from '@affine/core/modules/workspace';
import type { PageInfoCustomPropertyMeta } from '@affine/core/modules/workspace/properties/schema';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useService } from '@toeverything/infra';
import { useMemo } from 'react';

import { PagePropertiesMetaManager } from './page-properties-manager';

export const ConfirmDeletePropertyModal = ({
  onConfirm,
  onCancel,
  property,
  show,
}: {
  property: PageInfoCustomPropertyMeta;
  show: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const t = useAFFiNEI18N();
  const adapter = useService(WorkspacePropertiesAdapter);
  const count = useMemo(() => {
    const manager = new PagePropertiesMetaManager(adapter);
    return manager.getPropertyRelatedPages(property.id)?.size || 0;
  }, [adapter, property.id]);

  return (
    <ConfirmModal
      open={show}
      closeButtonOptions={{
        onClick: onCancel,
      }}
      title={t['com.affine.settings.workspace.properties.delete-property']()}
      description={
        <Trans
          values={{
            name: property.name,
            count,
          }}
          i18nKey="com.affine.settings.workspace.properties.delete-property-prompt"
        >
          The <strong>{{ name: property.name } as any}</strong> property will be
          removed from count doc(s). This action cannot be undone.
        </Trans>
      }
      onConfirm={onConfirm}
      cancelButtonOptions={{
        onClick: onCancel,
      }}
      confirmButtonOptions={{
        type: 'error',
        children: t['Confirm'](),
      }}
    />
  );
};
