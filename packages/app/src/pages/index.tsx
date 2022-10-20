import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { styled, useTheme } from '@/styles';
import { Header } from '@/components/Header';
import { FAQ } from '@/components/faq';
import '@/components/simple-counter';

const StyledEditorContainer = styled('div')(({ theme }) => {
  return {
    flexGrow: 1,
    paddingTop: '78px',
  };
});

const StyledPage = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: theme.colors.pageBackground,
    transition: 'background-color .5s',
  };
});

const DynamicEditor = dynamic(() => import('../components/editor'), {
  loading: () => <div>Loading...</div>,
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
    </StyledPage>
  );
};

export default Home;
