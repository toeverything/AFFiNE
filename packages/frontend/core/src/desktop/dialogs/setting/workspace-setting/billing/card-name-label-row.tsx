import { SubscriptionStatus } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import {
  InformationFillDuotoneIcon,
  SingleSelectCheckSolidIcon,
} from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useMemo } from 'react';

import * as styles from './styles.css';

const getStatusLabel = (status?: SubscriptionStatus) => {
  switch (status) {
    case SubscriptionStatus.Active:
      return <StatusLabel status={status} />;
    case SubscriptionStatus.PastDue:
      return <StatusLabel status={status} />;
    case SubscriptionStatus.Trialing:
      return <StatusLabel status={status} />;
    default:
      return null;
  }
};

export const CardNameLabelRow = ({
  cardName,
  status,
}: {
  cardName: string;
  status?: SubscriptionStatus;
}) => {
  const statusLabel = useMemo(() => getStatusLabel(status), [status]);
  return (
    <div className={styles.cardNameLabelRow}>
      <div className={styles.cardName}>{cardName}</div>
      {statusLabel}
    </div>
  );
};

const StatusLabel = ({ status }: { status: SubscriptionStatus }) => {
  const t = useI18n();
  const label = useMemo(() => {
    switch (status) {
      case SubscriptionStatus.Active:
        return t['com.affine.payment.subscription-status.active']();
      case SubscriptionStatus.PastDue:
        return t['com.affine.payment.subscription-status.past-due']();
      case SubscriptionStatus.Trialing:
        return t['com.affine.payment.subscription-status.trialing']();
      default:
        return '';
    }
  }, [status, t]);

  const icon = useMemo(() => {
    switch (status) {
      case SubscriptionStatus.Active:
      case SubscriptionStatus.Trialing:
        return <SingleSelectCheckSolidIcon />;
      case SubscriptionStatus.PastDue:
        return <InformationFillDuotoneIcon />;
      default:
        return null;
    }
  }, [status]);

  return (
    <div
      className={clsx(styles.cardLabelContainer, {
        'past-due': status === SubscriptionStatus.PastDue,
      })}
    >
      <div className={styles.cardLabelIcon}>{icon}</div>
      <div className={styles.cardLabel}>{label}</div>
    </div>
  );
};
