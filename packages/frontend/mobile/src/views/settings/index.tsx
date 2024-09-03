import { Modal } from '@affine/component';
import { openSettingModalAtom } from '@affine/core/atoms';
import { AuthService } from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { PageHeader } from '../../components';
import { AboutGroup } from './about';
import { AppearanceGroup } from './appearance';
import { OthersGroup } from './others';
import * as styles from './style.css';
import { UserProfile } from './user-profile';
import { UserUsage } from './user-usage';

export const MobileSettingModal = () => {
  const [{ open }, setOpen] = useAtom(openSettingModalAtom);

  const onOpenChange = useCallback(
    (open: boolean) => setOpen(prev => ({ ...prev, open })),
    [setOpen]
  );
  const closeModal = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Modal
      fullScreen
      animation="slideBottom"
      open={open}
      onOpenChange={onOpenChange}
      contentOptions={{
        style: {
          padding: 0,
          overflowY: 'auto',
          backgroundColor: cssVarV2('layer/background/secondary'),
        },
      }}
      withoutCloseButton
    >
      <MobileSetting onClose={closeModal} />
    </Modal>
  );
};

const MobileSetting = ({ onClose }: { onClose: () => void }) => {
  const t = useI18n();
  const session = useService(AuthService).session;

  useEffect(() => session.revalidate(), [session]);

  return (
    <>
      <PageHeader back backAction={onClose}>
        <span className={styles.pageTitle}>
          {t['com.affine.mobile.setting.header-title']()}
        </span>
      </PageHeader>

      <div className={styles.root}>
        <UserProfile />
        <UserUsage />
        <AppearanceGroup />
        <AboutGroup />
        <OthersGroup />
      </div>
    </>
  );
};
