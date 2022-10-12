import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { styled, useTheme } from '@/styles';

import '@/components/simple-counter';

const Button = styled('div')(({ theme }) => {
  return {
    color: theme.colors.primary,
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
      <Button>A button use the theme styles</Button>
      <simple-counter name="A counter created by web component" />
      <p>current mode {mode}</p>
      <button
        onClick={() => {
          changeMode('light');
        }}
      >
        light
      </button>
      <button
        onClick={() => {
          changeMode('dark');
        }}
      >
        dark
      </button>
      <button
        onClick={() => {
          changeMode('auto');
        }}
      >
        auto
      </button>
      <DynamicEditor />
    </div>
  );
};

export default Home;
