import { styled } from '@affine/component';
import { AffineLoading } from '@affine/component/affine-loading';
import { useTranslation } from '@affine/i18n';
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
    h1: {
      fontSize: '2em',
      marginTop: '15px',
      fontWeight: '600',
    },
  };
});

export const PageLoading = ({ text }: { text?: string }) => {
  const { t } = useTranslation();
  return (
    <StyledLoadingContainer>
      <div className="wrapper">
        <Loading />
        <h1>{text ? text : t('Loading')}</h1>
      </div>
    </StyledLoadingContainer>
  );
};

export default PageLoading;
