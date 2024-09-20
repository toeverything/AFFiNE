import { IconButton } from '@affine/component';
import { useInfoModal } from '@affine/core/components/affine/page-properties';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { InformationIcon } from '@blocksuite/icons/rc';
import { useCallback } from 'react';

export const InfoButton = ({ docId }: { docId: string }) => {
  const [_, setOpen] = useInfoModal(docId);
  const t = useI18n();

  const onOpenInfoModal = useCallback(() => {
    track.$.header.actions.openDocInfo();
    setOpen(true);
  }, [setOpen]);

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
