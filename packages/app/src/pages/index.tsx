import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { styled } from '@/styles';
import { Header } from '@/components/Header';
import { FAQ } from '@/components/faq';
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

const DynamicEditor = dynamic(() => import('../components/editor'), {
  loading: () => <div style={{ textAlign: 'center' }}>Loading...</div>,
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
