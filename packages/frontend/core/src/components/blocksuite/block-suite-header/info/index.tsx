import { IconButton } from '@affine/component';
import { openInfoModalAtom } from '@affine/core/components/atoms';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { InformationIcon } from '@blocksuite/icons/rc';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

export const InfoButton = () => {
  const setOpenInfoModal = useSetAtom(openInfoModalAtom);
  const t = useI18n();

  const onOpenInfoModal = useCallback(() => {
    track.$.header.actions.openDocInfo();
    setOpenInfoModal(true);
  }, [setOpenInfoModal]);

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
