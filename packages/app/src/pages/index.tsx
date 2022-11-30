import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { styled } from '@/styles';
import { Header } from '@/components/Header';
import { FAQ } from '@/components/faq';
import Loading from '@/components/loading';
import EdgelessToolbar from '@/components/edgeless-toolbar';
import MobileModal from '@/components/mobile-modal';
import '@/components/simple-counter';

const StyledEditorContainer = styled('div')(({ theme }) => {
  return {
    height: 'calc(100vh - 60px)',
  };
});

const StyledWrapper = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    backgroundColor: theme.colors.pageBackground,
    transition: 'background-color .5s',
    flexGrow: 1,
  };
});

const StyledLoadingContainer = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: theme.colors.primaryColor,
    h1: {
      fontSize: '2em',
      marginTop: '150px',
      fontWeight: '600',
    },
  };
});

const DynamicEditor = dynamic(() => import('../components/editor'), {
  loading: () => (
    <StyledLoadingContainer>
      <div className="wrapper">
        <Loading />
        <h1>Loading...</h1>
      </div>
    </StyledLoadingContainer>
  ),
  ssr: false,
});

const Home: NextPage = () => {
  return (
    <StyledWrapper>
      <Header />
      <MobileModal />
      <StyledEditorContainer>
        <DynamicEditor />
      </StyledEditorContainer>
      <FAQ />
      <EdgelessToolbar />
    </StyledWrapper>
  );
};

export default Home;
