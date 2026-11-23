import { Checkbox } from '@affine/component';
import type { CalendarAccountsQuery } from '@affine/graphql';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback } from 'react';

import * as styles from './subscription-setting.css';

type CalendarSubscription = NonNullable<
  NonNullable<CalendarAccountsQuery['currentUser']>['calendarAccounts'][number]
>['calendars'][number];

export const SubscriptionSetting = ({
  subscription,
  checked,
  onToggle,
}: {
  subscription: CalendarSubscription;
  checked: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) => {
  const handleToggle = useCallback(
    (nextChecked: boolean) => {
      onToggle(subscription.id, nextChecked);
    },
    [onToggle, subscription.id]
  );

  return (
    <div
      className={styles.item}
      onClick={() => handleToggle(!checked)}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleToggle(!checked);
        }
      }}
    >
      <Checkbox
        checked={checked}
        onChange={(_, nextChecked) => handleToggle(nextChecked)}
        onClick={event => event.stopPropagation()}
      />
      <div
        className={styles.color}
        style={{
          backgroundColor: subscription.color || cssVarV2.button.primary,
        }}
      />
      <div className={styles.info}>
        <div className={styles.name}>
          {subscription.displayName ?? subscription.externalCalendarId}
        </div>
        {subscription.timezone ? (
          <div className={styles.meta}>{subscription.timezone}</div>
        ) : null}
      </div>
    </div>
  );
};
