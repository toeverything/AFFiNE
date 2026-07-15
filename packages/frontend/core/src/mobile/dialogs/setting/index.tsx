import { notify } from '@affine/component';
import { AuthService } from '@affine/core/modules/cloud';
import type {
  DialogComponentProps,
  WORKSPACE_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { copyTextToClipboard } from '@affine/core/utils/clipboard';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import { AboutGroup } from './about';
import { AppearanceGroup } from './appearance';
import teamPeople from './assets/team-people.png';
import { DevicesGroup } from './devices';
import { ExperimentalFeatureSetting } from './experimental';
import { SettingGroup } from './group';
import { OthersGroup } from './others';
import { DeleteAccount } from './others/delete-account';
import { RowLayout } from './row.layout';
import * as styles from './style.css';
import { UserSubscription } from './subscription';
import { SwipeDialog } from './swipe-dialog';
import { UserProfile } from './user-profile';
import { UserUsage } from './user-usage';

const AFFINE_APP_STORE_URL =
  'https://apps.apple.com/app/notes-whiteboard-ai-affine/id6736937980';
const AFFINE_DOWNLOAD_URL = 'https://affine.pro/download';
const AFFINE_TEAM_URL = 'https://affine.pro/pricing';

const openExternal = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

const SupportGroup = () => {
  const t = useI18n();

  const shareApp = useCallback(async () => {
    const shareData = {
      title: 'AFFiNE',
      text: t['com.affine.mobile.setting.support.invite-message'](),
      url: AFFINE_DOWNLOAD_URL,
    };

    if ('share' in navigator && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }

    const copied = await copyTextToClipboard(AFFINE_DOWNLOAD_URL);
    if (copied) {
      notify.success({ title: t['Copied link to clipboard']() });
      return;
    }

    openExternal(AFFINE_DOWNLOAD_URL);
  }, [t]);

  return (
    <SettingGroup title={t['com.affine.mobile.setting.support.title']()}>
      <RowLayout
        label={t['com.affine.mobile.setting.support.rate']()}
        onClick={() => openExternal(AFFINE_APP_STORE_URL)}
      />
      <RowLayout
        label={t['com.affine.mobile.setting.support.invite']()}
        onClick={() => void shareApp()}
      />
    </SettingGroup>
  );
};

const TeamPromotionCard = () => {
  const t = useI18n();

  return (
    <button
      type="button"
      className={styles.promoCard}
      onClick={() => openExternal(AFFINE_TEAM_URL)}
    >
      <span className={styles.promoCardTitle}>
        {t['com.affine.mobile.setting.promo.title']()}
      </span>
      <span className={styles.promoCardDescription}>
        {t['com.affine.mobile.setting.promo.description']()}
      </span>
      <img className={styles.promoCardArt} src={teamPeople} alt="" />
    </button>
  );
};

const DangerZoneGroup = ({
  onDeleteFinished,
}: {
  onDeleteFinished?: () => void;
}) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const account = useLiveData(authService.session.account$);

  if (!account) {
    return null;
  }

  return (
    <SettingGroup
      title={
        <span className={styles.dangerZoneTitle}>
          {t['com.affine.mobile.setting.danger-zone.title']()}
        </span>
      }
    >
      <DeleteAccount onDeleteFinished={onDeleteFinished} />
    </SettingGroup>
  );
};

const MobileSetting = ({
  onDeleteFinished,
}: {
  onDeleteFinished?: () => void;
}) => {
  const session = useService(AuthService).session;

  useEffect(() => session.revalidate(), [session]);

  return (
    <div className={styles.root}>
      <UserSubscription />
      <UserProfile />
      <AppearanceGroup />
      <AboutGroup />
      <ExperimentalFeatureSetting />
      <TeamPromotionCard />
      <SupportGroup />
      <OthersGroup />
      <UserUsage />
      <DevicesGroup />
      <DangerZoneGroup onDeleteFinished={onDeleteFinished} />
    </div>
  );
};

export const SettingDialog = ({
  close,
}: DialogComponentProps<WORKSPACE_DIALOG_SCHEMA['setting']>) => {
  const t = useI18n();

  return (
    <SwipeDialog
      title={t['com.affine.mobile.setting.header-title']()}
      open
      onOpenChange={() => close()}
    >
      <MobileSetting onDeleteFinished={close} />
    </SwipeDialog>
  );
};
