import { Button, notify } from '@affine/component';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { IntegrationService } from '@affine/core/modules/integration';
import { useI18n } from '@affine/i18n';
import { TodayIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { IntegrationSettingHeader } from '../setting';
import * as styles from './setting-panel.css';
import { SubscriptionSetting } from './subscription-setting';

const isSameSelection = (left: Set<string>, right: Set<string>) => {
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
};

export const CalendarSettingPanel = () => {
  const t = useI18n();
  const calendar = useService(IntegrationService).calendar;
  const workspaceServerService = useService(WorkspaceServerService);
  const server = useLiveData(workspaceServerService.server$);
  const accounts = useLiveData(calendar.accounts$);
  const accountCalendars = useLiveData(calendar.accountCalendars$);
  const workspaceCalendars = useLiveData(calendar.workspaceCalendars$);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    calendar.revalidateWorkspaceCalendars().catch(() => undefined);
    calendar.loadAccountCalendars().catch(() => undefined);
  }, [calendar, server]);

  useEffect(() => {
    const selected = new Set(
      workspaceCalendars[0]?.items.map(item => item.subscriptionId) ?? []
    );
    setSelectedIds(selected);
  }, [workspaceCalendars]);

  const orderedSubscriptions = useMemo(() => {
    return accounts.flatMap(account => accountCalendars.get(account.id) ?? []);
  }, [accounts, accountCalendars]);

  const handleToggle = useCallback((id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const hasChanges = useMemo(() => {
    const saved = new Set(
      workspaceCalendars[0]?.items.map(item => item.subscriptionId) ?? []
    );
    return !isSameSelection(saved, selectedIds);
  }, [selectedIds, workspaceCalendars]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const items = orderedSubscriptions
        .filter(subscription => selectedIds.has(subscription.id))
        .map((subscription, index) => ({
          subscriptionId: subscription.id,
          sortOrder: index,
        }));
      await calendar.updateWorkspaceCalendars(items);
    } catch (error) {
      notify.error({
        title: t['com.affine.integration.calendar.save-error'](),
      });
    } finally {
      setSaving(false);
    }
  }, [calendar, orderedSubscriptions, selectedIds, t]);

  const hasCalendars = orderedSubscriptions.length > 0;

  return (
    <>
      <IntegrationSettingHeader
        icon={<TodayIcon />}
        name={t['com.affine.integration.calendar.name']()}
        desc={t['com.affine.integration.calendar.desc']()}
        divider={false}
      />
      <div className={styles.list}>
        {accounts.map(account => {
          const calendars = accountCalendars.get(account.id) ?? [];
          if (calendars.length === 0) return null;
          const title = account.displayName ?? account.email ?? account.id;
          const caption =
            account.displayName && account.email ? account.email : null;
          return (
            <section key={account.id} className={styles.group}>
              <div className={styles.groupHeader}>
                <div>
                  <div className={styles.groupTitle}>{title}</div>
                  {caption ? (
                    <div className={styles.groupCaption}>{caption}</div>
                  ) : null}
                </div>
                <div className={styles.groupMeta}>
                  {calendars.length}{' '}
                  {t['com.affine.integration.calendar.name']()}
                </div>
              </div>
              <div className={styles.groupList}>
                {calendars.map(subscription => (
                  <SubscriptionSetting
                    key={subscription.id}
                    subscription={subscription}
                    checked={selectedIds.has(subscription.id)}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </section>
          );
        })}
        {!hasCalendars ? (
          <div className={styles.empty}>
            {t['com.affine.integration.calendar.no-calendar']()}
          </div>
        ) : null}
      </div>
      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => void handleSave()}
          disabled={!hasChanges || saving}
          loading={saving}
        >
          {t['com.affine.editCollection.save']()}
        </Button>
      </div>
    </>
  );
};
