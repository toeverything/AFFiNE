import { Button, Input, Modal, notify } from '@affine/component';
import { IntegrationService } from '@affine/core/modules/integration';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { PlusIcon, TodayIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { IntegrationCardIcon } from '../card';
import { IntegrationSettingHeader } from '../setting';
import * as styles from './setting-panel.css';
import { SubscriptionSetting } from './subscription-setting';

export const CalendarSettingPanel = () => {
  const t = useI18n();
  const calendar = useService(IntegrationService).calendar;
  const subscriptions = useLiveData(calendar.subscriptions$);
  return (
    <>
      <IntegrationSettingHeader
        icon={<TodayIcon />}
        name={t['com.affine.integration.calendar.name']()}
        desc={t['com.affine.integration.calendar.desc']()}
        divider={false}
      />
      <div className={styles.list}>
        {subscriptions.map(subscription => (
          <SubscriptionSetting
            key={subscription.url}
            subscription={subscription}
          />
        ))}
        <AddSubscription />
      </div>
    </>
  );
};

const AddSubscription = () => {
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [verifying, setVerifying] = useState(false);
  const calendar = useService(IntegrationService).calendar;

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);
  const handleClose = useCallback(() => {
    setOpen(false);
    setUrl('');
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setUrl(value);
  }, []);

  const handleAddSub = useCallback(() => {
    const _url = url.trim();
    const exists = calendar.getSubscription(_url);
    if (exists) {
      notify.error({
        title: t['com.affine.integration.calendar.new-duplicate-error-title'](),
        message:
          t['com.affine.integration.calendar.new-duplicate-error-content'](),
      });
      return;
    }

    setVerifying(true);
    calendar
      .createSubscription(_url)
      .then(() => {
        setOpen(false);
        setUrl('');
        track.$.settingsPanel.integrationList.connectIntegration({
          type: 'calendar',
          control: 'Calendar Setting',
          result: 'success',
        });
      })
      .catch(() => {
        notify.error({
          title: t['com.affine.integration.calendar.new-error'](),
        });
      })
      .finally(() => {
        setVerifying(false);
      });
  }, [calendar, t, url]);

  return (
    <>
      <Button
        prefix={<PlusIcon />}
        size="large"
        onClick={handleOpen}
        className={styles.newButton}
      >
        {t['com.affine.integration.calendar.new-subscription']()}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        persistent
        withoutCloseButton
        contentOptions={{ className: styles.newDialog }}
      >
        <header className={styles.newDialogHeader}>
          <IntegrationCardIcon>
            <TodayIcon />
          </IntegrationCardIcon>
          <div className={styles.newDialogTitle}>
            {t['com.affine.integration.calendar.new-title']()}
          </div>
        </header>

        <div className={styles.newDialogContent}>
          <div className={styles.newDialogLabel}>
            {t['com.affine.integration.calendar.new-url-label']()}
          </div>
          <Input
            type="text"
            value={url}
            onChange={handleInputChange}
            placeholder="https://example.com/calendar.ics"
            onEnter={handleAddSub}
          />
        </div>

        <footer className={styles.newDialogFooter}>
          <Button onClick={handleClose}>{t['Cancel']()}</Button>
          <Button variant="primary" onClick={handleAddSub} loading={verifying}>
            {t['com.affine.integration.calendar.new-subscription']()}
          </Button>
        </footer>
      </Modal>
    </>
  );
};
