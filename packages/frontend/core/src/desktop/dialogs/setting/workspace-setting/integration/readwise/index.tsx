import {
  IntegrationService,
  IntegrationTypeIcon,
} from '@affine/core/modules/integration';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import {
  IntegrationCard,
  IntegrationCardContent,
  IntegrationCardFooter,
  IntegrationCardHeader,
} from '../card';
import { ConnectButton } from './connect';
import { ConnectedActions } from './connected';
import { ImportDialog } from './import-dialog';
import { SettingDialog } from './setting-dialog';

export const ReadwiseIntegration = () => {
  const t = useI18n();
  const readwise = useService(IntegrationService).readwise;

  const [openSetting, setOpenSetting] = useState(false);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const settings = useLiveData(readwise.settings$);
  const token = settings?.token;

  const handleOpenSetting = useCallback(() => setOpenSetting(true), []);
  const handleCloseSetting = useCallback(() => setOpenSetting(false), []);

  const handleConnectSuccess = useCallback(
    (token: string) => {
      readwise.connect(token);
      handleOpenSetting();
    },
    [handleOpenSetting, readwise]
  );

  const handleImport = useCallback(() => {
    setOpenSetting(false);
    setOpenImportDialog(true);
  }, []);

  return (
    <IntegrationCard>
      <IntegrationCardHeader
        icon={<IntegrationTypeIcon type="readwise" />}
        onSettingClick={handleOpenSetting}
      />
      <IntegrationCardContent
        title={t['com.affine.integration.readwise.name']()}
        desc={t['com.affine.integration.readwise.desc']()}
      />
      <IntegrationCardFooter>
        {token ? (
          <>
            <ConnectedActions onImport={handleImport} />
            {openSetting && (
              <SettingDialog
                onClose={handleCloseSetting}
                onImport={handleImport}
              />
            )}
            {openImportDialog && (
              <ImportDialog onClose={() => setOpenImportDialog(false)} />
            )}
          </>
        ) : (
          <ConnectButton onSuccess={handleConnectSuccess} />
        )}
      </IntegrationCardFooter>
    </IntegrationCard>
  );
};
