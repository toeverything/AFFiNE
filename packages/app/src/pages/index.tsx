import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { styled } from '@/styles';
import { Header } from '@/components/Header';
import { FAQ } from '@/components/faq';
import Loading from '@/components/loading';
import EdgelessToolbar from '@/components/edgeless-toolbar';
import '@/components/simple-counter';

const StyledEditorContainer = styled('div')(({ theme }) => {
  return {
    height: 'calc(100vh - 60px)',
  };
});

const StyledPage = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    paddingTop: '60px',
    backgroundColor: theme.colors.pageBackground,
    transition: 'background-color .5s',
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
    <StyledPage>
      <Header />
      <StyledEditorContainer>
        <DynamicEditor />
      </StyledEditorContainer>
      <FAQ />
      <EdgelessToolbar />
    </StyledPage>
  );
};

export default Home;
