import { Button } from '@/ui/button';
import { useTranslation } from '@affine/i18n';
import { useState } from 'react';
import { EnableWorkspaceModal } from './EnableWorkspaceModal';

export const EnableWorkspaceButton = () => {
  const { t } = useTranslation();
  const [enableModalOpen, setEnableModalOpen] = useState(false);
  return (
    <>
      <Button
        type="light"
        shape="circle"
        onClick={async () => {
          setEnableModalOpen(true);
        }}
      >
        {t('Enable AFFiNE Cloud')}
      </Button>
      <EnableWorkspaceModal
        open={enableModalOpen}
        onClose={() => {
          setEnableModalOpen(false);
        }}
      ></EnableWorkspaceModal>
    </>
  );
};
