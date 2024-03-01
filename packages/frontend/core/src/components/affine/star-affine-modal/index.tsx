import { OverlayModal } from '@affine/component';
import { openStarAFFiNEModalAtom } from '@affine/core/atoms';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAtom } from 'jotai';

export const StarAFFiNEModal = () => {
  const t = useAFFiNEI18N();
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
      to={runtimeConfig.githubUrl}
      confirmButtonOptions={{
        type: 'primary',
      }}
      confirmText={t['com.affine.star-affine.confirm']()}
      external
    />
  );
};
