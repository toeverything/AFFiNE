import { Button, InlineEdit, Menu, useConfirmModal } from '@affine/component';
import {
  type CalendarSubscription,
  IntegrationService,
} from '@affine/core/modules/integration';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import { IntegrationSettingToggle } from '../setting';
import * as styles from './subscription-setting.css';

export const SubscriptionSetting = ({
  subscription,
}: {
  subscription: CalendarSubscription;
}) => {
  const t = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const calendar = useService(IntegrationService).calendar;
  const config = useLiveData(subscription.config$);
  const name = useLiveData(subscription.name$) || t['Untitled']();

  const handleColorChange = useCallback(
    (color: string) => {
      calendar.updateSubscription(subscription.url, { color });
      setMenuOpen(false);
    },
    [calendar, subscription.url]
  );

  const toggleShowEvents = useCallback(() => {
    calendar.updateSubscription(subscription.url, {
      showEvents: !config?.showEvents,
    });
  }, [calendar, subscription.url, config?.showEvents]);

  const toggleShowAllDayEvents = useCallback(() => {
    calendar.updateSubscription(subscription.url, {
      showAllDayEvents: !config?.showAllDayEvents,
    });
  }, [calendar, subscription.url, config?.showAllDayEvents]);

  const handleNameChange = useCallback(
    (value: string) => {
      calendar.updateSubscription(subscription.url, { name: value });
    },
    [calendar, subscription.url]
  );

  if (!config) return null;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <Menu
          rootOptions={{ open: menuOpen, onOpenChange: setMenuOpen }}
          contentOptions={{ alignOffset: -6 }}
          items={
            <ColorPicker
              activeColor={config.color}
              onChange={handleColorChange}
            />
          }
        >
          <div
            className={styles.colorPickerTrigger}
            style={{ color: config.color }}
          />
        </Menu>
        <InlineEdit
          className={styles.name}
          editable
          trigger="click"
          value={name}
          onChange={handleNameChange}
        />
        <UnsubscribeButton url={subscription.url} name={name} />
      </div>
      <div className={styles.divider} />
      <IntegrationSettingToggle
        name={t['com.affine.integration.calendar.show-events']()}
        desc={t['com.affine.integration.calendar.show-events-desc']()}
        checked={!!config.showEvents}
        onChange={toggleShowEvents}
      />
      <div
        data-collapsed={!config.showEvents}
        className={styles.allDayEventsContainer}
      >
        <div className={styles.allDayEventsContent}>
          <div className={styles.divider} />
          <IntegrationSettingToggle
            name={t['com.affine.integration.calendar.show-all-day-events']()}
            checked={!!config.showAllDayEvents}
            onChange={toggleShowAllDayEvents}
          />
        </div>
      </div>
    </div>
  );
};

const UnsubscribeButton = ({ url, name }: { url: string; name: string }) => {
  const t = useI18n();
  const calendar = useService(IntegrationService).calendar;
  const { openConfirmModal } = useConfirmModal();

  const handleUnsubscribe = useCallback(() => {
    openConfirmModal({
      title: t['com.affine.integration.calendar.unsubscribe'](),
      children: t.t('com.affine.integration.calendar.unsubscribe-content', {
        name,
      }),
      onConfirm: () => {
        calendar.deleteSubscription(url);
        track.$.settingsPanel.integrationList.disconnectIntegration({
          type: 'calendar',
          control: 'Calendar Setting',
        });
      },
      confirmText: t['com.affine.integration.calendar.unsubscribe'](),
      confirmButtonOptions: {
        variant: 'error',
      },
    });
  }, [calendar, name, openConfirmModal, t, url]);

  return (
    <Button variant="error" onClick={handleUnsubscribe}>
      {t['com.affine.integration.calendar.unsubscribe']()}
    </Button>
  );
};

const ColorPicker = ({
  activeColor,
  onChange,
}: {
  onChange: (color: string) => void;
  activeColor: string;
}) => {
  const calendar = useService(IntegrationService).calendar;
  const colors = useMemo(() => calendar.colors, [calendar]);

  return (
    <ul className={styles.colorPicker}>
      {colors.map(color => (
        <li
          key={color}
          onClick={() => onChange(color)}
          data-active={color === activeColor}
          className={styles.colorPickerItem}
          style={{ color }}
        />
      ))}
    </ul>
  );
};
