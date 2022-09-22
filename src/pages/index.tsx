import type { NextPage } from 'next';
import styled from '@emotion/styled';

import '@/components/simple-counter';

const Button = styled('div')(({ theme }) => {
  return {
    color: theme.colors.primary,
  };
});

const Home: NextPage = () => {
  return (
    <div>
      <Button>A button use the theme styles</Button>
      <simple-counter name="A counter created by web component" />
    </div>
  );
};

export default Home;
