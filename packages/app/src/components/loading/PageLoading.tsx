import { styled } from '@/styles';
import Loading from './Loading';

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

export const PageLoading = ({ text = 'Loading...' }: { text?: string }) => {
  return (
    <StyledLoadingContainer>
      <div className="wrapper">
        <Loading />
        <h1>{text}</h1>
      </div>
    </StyledLoadingContainer>
  );
};

export default PageLoading;
