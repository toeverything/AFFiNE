import { IconButton } from '@affine/component';
import { DocInfoService } from '@affine/core/modules/doc-info';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { InformationIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback } from 'react';

export const InfoButton = ({ docId }: { docId: string }) => {
  const modal = useService(DocInfoService).modal;
  const t = useI18n();

  const onOpenInfoModal = useCallback(() => {
    track.$.header.actions.openDocInfo();
    modal.open(docId);
  }, [docId, modal]);

  return (
    <IconButton
      size="20"
      tooltip={t['com.affine.page-properties.page-info.view']()}
      data-testid="header-info-button"
      onClick={onOpenInfoModal}
    >
      <InformationIcon />
    </IconButton>
  );
};
