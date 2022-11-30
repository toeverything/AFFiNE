import type { NextPage } from 'next';
import { styled } from '@/styles';
import { Header } from '@/components/Header';
import { FAQ } from '@/components/faq';
import EdgelessToolbar from '@/components/edgeless-toolbar';
import MobileModal from '@/components/mobile-modal';
import Editor from '@/components/editor';

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

const Home: NextPage = () => {
  return (
    <StyledWrapper>
      <Header />
      <MobileModal />
      <StyledEditorContainer>
        <Editor />
      </StyledEditorContainer>
      <FAQ />
      <EdgelessToolbar />
    </StyledWrapper>
  );
};

export default Home;
