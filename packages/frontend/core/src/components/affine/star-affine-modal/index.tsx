import { OverlayModal } from '@affine/component';
import { openStarAFFiNEModalAtom } from '@affine/core/atoms';
import { useI18n } from '@affine/i18n';
import { useAtom } from 'jotai';

export const StarAFFiNEModal = () => {
  const t = useI18n();
  const [open, setOpen] = useAtom(openStarAFFiNEModalAtom);

  return (
    <OverlayModal
      open={open}
      topImage={
        <video
          width={400}
          height={300}
          style={{ objectFit: 'cover' }}
          src={'/static/githubStar.mp4'}
          autoPlay
          loop
        />
      }
      title={t['com.affine.star-affine.title']()}
      onOpenChange={setOpen}
      description={t['com.affine.star-affine.description']()}
      cancelText={t['com.affine.star-affine.cancel']()}
      to={BUILD_CONFIG.githubUrl}
      confirmButtonOptions={{
        variant: 'primary',
      }}
      confirmText={t['com.affine.star-affine.confirm']()}
      external
    />
  );
};
