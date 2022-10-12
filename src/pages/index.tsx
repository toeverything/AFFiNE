import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { styled, useTheme } from '@/styles';
import { Header } from '@/components/Header';

import '@/components/simple-counter';

const StyledEditorContainer = styled('div')(({ theme }) => {
  return {
    width: '720px',
    margin: '78px auto 0',
  };
});

const DynamicEditor = dynamic(() => import('../components/editor'), {
  loading: () => <div>Loading...</div>,
  ssr: false,
});

const Home: NextPage = () => {
  const { changeMode, mode } = useTheme();
  return (
    <div>
      <Header />
      <StyledEditorContainer></StyledEditorContainer>
      {/*<Button>A button use the theme styles</Button>*/}
      {/*<simple-counter name="A counter created by web component" />*/}
      {/*<p>current mode {mode}</p>*/}
      {/*<button*/}
      {/*  onClick={() => {*/}
      {/*    changeMode('light');*/}
      {/*  }}*/}
      {/*>*/}
      {/*  light*/}
      {/*</button>*/}
      {/*<button*/}
      {/*  onClick={() => {*/}
      {/*    changeMode('dark');*/}
      {/*  }}*/}
      {/*>*/}
      {/*  dark*/}
      {/*</button>*/}
      {/*<button*/}
      {/*  onClick={() => {*/}
      {/*    changeMode('auto');*/}
      {/*  }}*/}
      {/*>*/}
      {/*  auto*/}
      {/*</button>*/}
      <DynamicEditor />
    </div>
  );
};

export default Home;
