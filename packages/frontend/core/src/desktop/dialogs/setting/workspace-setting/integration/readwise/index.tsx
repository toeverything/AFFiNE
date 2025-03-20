import {
  IntegrationService,
  IntegrationTypeIcon,
} from '@affine/core/modules/integration';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';

import {
  IntegrationCard,
  IntegrationCardContent,
  IntegrationCardFooter,
  IntegrationCardHeader,
} from '../card';
import { ConnectButton } from './connect';
import { ConnectedActions } from './connected';

export const ReadwiseIntegration = () => {
  const t = useI18n();
  const readwise = useService(IntegrationService).readwise;

  const settings = useLiveData(readwise.settings$);
  const token = settings?.token;

  return (
    <IntegrationCard>
      <IntegrationCardHeader icon={<IntegrationTypeIcon type="readwise" />} />
      <IntegrationCardContent
        title={t['com.affine.integration.readwise.name']()}
        desc={t['com.affine.integration.readwise.desc']()}
      />
      <IntegrationCardFooter>
        {token ? <ConnectedActions /> : <ConnectButton />}
      </IntegrationCardFooter>
    </IntegrationCard>
  );
};
