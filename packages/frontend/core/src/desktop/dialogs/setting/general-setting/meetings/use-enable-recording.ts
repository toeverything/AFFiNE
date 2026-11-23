import { useConfirmModal } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { MeetingSettingsService } from '@affine/core/modules/media/services/meeting-settings';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { useService } from '@toeverything/infra';

export const useEnableRecording = () => {
  const meetingSettingsService = useService(MeetingSettingsService);
  const confirmModal = useConfirmModal();
  const t = useI18n();

  const handleEnabledChange = useAsyncCallback(
    async (checked: boolean) => {
      try {
        track.$.settingsPanel.meetings.toggleMeetingFeatureFlag({
          option: checked ? 'on' : 'off',
          type: 'Meeting record',
        });
        await meetingSettingsService.setEnabled(checked);
      } catch {
        confirmModal.openConfirmModal({
          title:
            t['com.affine.settings.meetings.record.permission-modal.title'](),
          description:
            t[
              'com.affine.settings.meetings.record.permission-modal.description'
            ](),
          onConfirm: async () => {
            await meetingSettingsService.showRecordingPermissionSetting(
              'screen'
            );
          },
          cancelText: t['com.affine.recording.dismiss'](),
          confirmButtonOptions: {
            variant: 'primary',
          },
          confirmText:
            t[
              'com.affine.settings.meetings.record.permission-modal.open-setting'
            ](),
        });
      }
    },
    [confirmModal, meetingSettingsService, t]
  );

  return handleEnabledChange;
};
