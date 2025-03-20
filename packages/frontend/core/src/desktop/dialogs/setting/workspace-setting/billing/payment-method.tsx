import { Button } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/components/hooks/use-mutation';
import { UrlService } from '@affine/core/modules/url';
import { createCustomerPortalMutation } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';

import * as styles from './styles.css';

export const PaymentMethodUpdater = () => {
  const { isMutating, trigger } = useMutation({
    mutation: createCustomerPortalMutation,
  });
  const urlService = useService(UrlService);
  const t = useI18n();

  const update = useAsyncCallback(async () => {
    await trigger(null, {
      onSuccess: data => {
        urlService.openPopupWindow(data.createCustomerPortal);
      },
    });
  }, [trigger, urlService]);

  return (
    <SettingRow
      className={styles.paymentMethod}
      name={t['com.affine.payment.billing-setting.payment-method']()}
      desc={t[
        'com.affine.payment.billing-setting.payment-method.description'
      ]()}
    >
      <Button onClick={update} loading={isMutating} disabled={isMutating}>
        {t['com.affine.payment.billing-setting.payment-method.go']()}
      </Button>
    </SettingRow>
  );
};
