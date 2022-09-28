import type { NextPage } from 'next';
import { styled, useTheme } from '@/styles';
import '@/components/simple-counter';

const Button = styled('div')(({ theme }) => {
  return {
    color: theme.colors.primary,
  };
});

const Home: NextPage = () => {
  const { changeMode, mode } = useTheme();
  return (
    <div>
      <Button>A button use the theme styles</Button>
      <simple-counter name="A counter created by web component" />
      <button
        onClick={() => {
          changeMode(mode === 'dark' ? 'light' : 'dark');
        }}
      >
        current theme mode :{mode}(click to change)
      </button>
      <button
        onClick={() => {
          changeMode('auto');
        }}
      >
        click to set "auto" mode
      </button>
    </div>
  );
};

export default Home;
