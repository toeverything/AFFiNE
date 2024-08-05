import { ConfirmModal } from '@affine/component';
import { WorkspacePropertiesAdapter } from '@affine/core/modules/properties';
import type { PageInfoCustomPropertyMeta } from '@affine/core/modules/properties/services/schema';
import { Trans, useI18n } from '@affine/i18n';
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
  const t = useI18n();
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
      confirmText={t['Confirm']()}
      onConfirm={onConfirm}
      cancelButtonOptions={{
        onClick: onCancel,
      }}
      confirmButtonOptions={{
        variant: 'error',
      }}
    />
  );
};
