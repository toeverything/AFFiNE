import type { NextPage } from 'next';
import { styled, useTheme } from '@/styles';
import { Header } from '@/components/Header';

import '@/components/simple-counter';

const StyledEditorContainer = styled('div')(({ theme }) => {
  return {
    width: '720px',
    margin: '78px auto 0',
  };
});

const Home: NextPage = () => {
  const { changeMode, mode } = useTheme();
  return (
    <div>
      <Header />
      <StyledEditorContainer></StyledEditorContainer>
    </div>
  );
};

export default Home;
