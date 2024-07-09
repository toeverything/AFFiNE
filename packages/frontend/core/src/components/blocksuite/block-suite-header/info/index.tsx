import { IconButton, Tooltip } from '@affine/component';
import { openInfoModalAtom } from '@affine/core/atoms';
import { useI18n } from '@affine/i18n';
import { InformationIcon } from '@blocksuite/icons/rc';
import { useSetAtom } from 'jotai';

export const InfoButton = () => {
  const setOpenInfoModal = useSetAtom(openInfoModalAtom);
  const t = useI18n();
  const onOpenInfoModal = () => {
    setOpenInfoModal(true);
  };
  return (
    <Tooltip content={t['com.affine.page-properties.page-info.view']()}>
      <IconButton
        data-testid="header-info-button"
        onClick={onOpenInfoModal}
        icon={<InformationIcon />}
      />
    </Tooltip>
  );
};
