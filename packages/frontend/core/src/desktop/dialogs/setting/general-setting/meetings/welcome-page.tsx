import { Button } from '@affine/component';
import { MeetingSettingsService } from '@affine/core/modules/media/services/meeting-settings';
import { Trans, useI18n } from '@affine/i18n';
import { DualLinkIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useTheme } from 'next-themes';
import { useCallback } from 'react';

import meetingAppsDark from './meeting-apps.dark.assets.svg';
import meetingAppsLight from './meeting-apps.light.assets.svg';
import { useEnableRecording } from './use-enable-recording';
import * as styles from './welcome-page.css';

export const MeetingsWelcomePage = () => {
  const t = useI18n();
  const meetingSettingsService = useService(MeetingSettingsService);
  const enableRecording = useEnableRecording();
  const getStartedClicked = useCallback(() => {
    meetingSettingsService.setBetaDisclaimerAccepted(true);
    enableRecording(true);
  }, [meetingSettingsService, enableRecording]);
  const theme = useTheme();
  const meetingApps =
    theme.resolvedTheme === 'dark' ? meetingAppsDark : meetingAppsLight;
  return (
    <div className={styles.root}>
      <div className={styles.titleWrapper}>
        <div className={styles.title}>
          {t['com.affine.settings.meetings.setting.welcome']()}
          <div className={styles.beta}>Beta</div>
        </div>
        <div className={styles.subtitle}>
          {t['com.affine.settings.meetings.setting.prompt']()}
        </div>
      </div>
      <div className={styles.meetingAppsWrapper}>
        <img src={meetingApps} alt="meeting-apps" />
      </div>

      <div className={styles.hintsContainer}>
        <div className={styles.hints}>
          <Trans
            className={styles.hints}
            i18nKey="com.affine.settings.meetings.setting.welcome.hints"
            components={{
              strong: <strong />,
              ul: <ul />,
              li: <li />,
            }}
          />
          <a
            className={styles.learnMoreLink}
            href="https://discord.com/channels/959027316334407691/1358384103925350542"
            target="_blank"
            rel="noreferrer"
          >
            {t['com.affine.settings.meetings.setting.welcome.learn-more']()}
            <DualLinkIcon className={styles.linkIcon} />
          </a>
          <div className={styles.betaFreePrompt}>
            <Trans
              i18nKey="com.affine.settings.meetings.setting.prompt.2"
              components={{
                strong: <strong />,
              }}
            />
          </div>
        </div>
        <Button
          onClick={getStartedClicked}
          variant="primary"
          className={styles.getStartedButton}
        >
          {t[
            'com.affine.settings.workspace.experimental-features.get-started'
          ]()}
        </Button>
      </div>
    </div>
  );
};
