import type { Meta, StoryFn } from '@storybook/react';
import type { PropsWithChildren } from 'react';

import { Spotlight } from './index';

export default {
  title: 'Components/AppSidebar/Spotlight',
  component: Spotlight,
} satisfies Meta;

const Container = ({ children }: PropsWithChildren) => (
  <main
    style={{
      position: 'relative',
      width: '320px',
      height: '320px',
      border: '1px solid #ccc',
    }}
  >
    {children}
  </main>
);

export const Default: StoryFn = () => {
  return (
    <Container>
      <Spotlight />
    </Container>
  );
};
