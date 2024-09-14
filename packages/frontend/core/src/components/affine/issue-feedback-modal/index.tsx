import { OverlayModal } from '@affine/component';
import { openIssueFeedbackModalAtom } from '@affine/core/components/atoms';
import { useI18n } from '@affine/i18n';
import { useAtom } from 'jotai';

export const IssueFeedbackModal = () => {
  const t = useI18n();
  const [open, setOpen] = useAtom(openIssueFeedbackModalAtom);

  return (
    <OverlayModal
      open={open}
      topImage={
        <video
          width={400}
          height={300}
          style={{ objectFit: 'cover' }}
          src={'/static/newIssue.mp4'}
          autoPlay
          loop
        />
      }
      title={t['com.affine.issue-feedback.title']()}
      onOpenChange={setOpen}
      description={t['com.affine.issue-feedback.description']()}
      cancelText={t['com.affine.issue-feedback.cancel']()}
      to={`${BUILD_CONFIG.githubUrl}/issues/new/choose`}
      confirmText={t['com.affine.issue-feedback.confirm']()}
      confirmButtonOptions={{
        variant: 'primary',
      }}
      external
    />
  );
};
