import { styled } from '@/styles';
import CommonLoading from '@/components/loading';

const StyledLoadingContainer = styled('div')(({ theme }) => {
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

export const Loading = () => {
  return (
    <StyledLoadingContainer>
      <div className="wrapper">
        <CommonLoading />
        <h1>Loading...</h1>
      </div>
    </StyledLoadingContainer>
  );
};

export default Loading;
