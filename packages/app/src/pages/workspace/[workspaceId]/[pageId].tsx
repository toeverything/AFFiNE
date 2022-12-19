import type { NextPage } from 'next';
import { styled } from '@/styles';
import { EditorHeader } from '@/components/header';
import EdgelessToolbar from '@/components/edgeless-toolbar';
import MobileModal from '@/components/mobile-modal';
import Editor from '@/components/editor';

const StyledEditorContainer = styled('div')(({ theme }) => {
  return {
    height: 'calc(100vh - 60px)',
  };
});

const Home: NextPage = () => {
  return (
    <>
      <EditorHeader />
      <MobileModal />
      <StyledEditorContainer>
        <Editor />
      </StyledEditorContainer>
      <EdgelessToolbar />
    </>
  );
};

export default Home;
