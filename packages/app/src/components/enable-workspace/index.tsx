import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { Button } from '@/ui/button';
import { useTranslation } from '@affine/i18n';
import { useState } from 'react';

export const EnableWorkspaceButton = () => {
  const { t } = useTranslation();
  const { enableWorkspace } = useWorkspaceHelper();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      type="primary"
      shape="circle"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await enableWorkspace();
        setLoading(false);
      }}
    >
      {t('Enable AFFiNE Cloud')}
    </Button>
  );
};
