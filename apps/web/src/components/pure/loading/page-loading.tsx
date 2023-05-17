import { AffineLoading } from '@affine/component/affine-loading';
import { memo, Suspense } from 'react';

export const Loading = memo(function Loading() {
  return (
    <div
      style={{
        height: '180px',
        width: '180px',
      }}
    >
      <Suspense>
        <AffineLoading loop={true} autoplay={true} autoReverse={true} />
      </Suspense>
    </div>
  );
});

/**
 * @deprecated use skeleton instead
 */
export const PageLoading = () => {
  return null;
};
