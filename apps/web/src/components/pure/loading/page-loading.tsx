import { styled } from '@affine/component';
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

// Used for the full page loading
const StyledLoadingContainer = styled('div')(() => {
  return {
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#6880FF',
    flexDirection: 'column',
    h1: {
      fontSize: '2em',
      marginTop: '15px',
      fontWeight: '600',
    },
  };
});

export const PageLoading = () => {
  // We disable the loading on desktop, because want it looks faster.
  //  This is a design requirement.
  if (environment.isDesktop) {
    return null;
  }
  return (
    <StyledLoadingContainer>
      <Loading />
    </StyledLoadingContainer>
  );
};

export default PageLoading;
