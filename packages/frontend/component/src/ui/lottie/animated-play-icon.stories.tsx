import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import { AnimatedPlayIcon } from './animated-play-icon';

export default {
  title: 'UI/Audio Player/Animated Play Icon',
  component: AnimatedPlayIcon,
  parameters: {
    docs: {
      description: {
        component:
          'An animated icon that transitions between play, pause, and loading states.',
      },
    },
  },
} satisfies Meta<typeof AnimatedPlayIcon>;

const Template: StoryFn<typeof AnimatedPlayIcon> = args => (
  <AnimatedPlayIcon {...args} />
);

export const Play = Template.bind({});
Play.args = {
  state: 'play',
};

export const Pause = Template.bind({});
Pause.args = {
  state: 'pause',
};

export const WithStateToggle: StoryFn<typeof AnimatedPlayIcon> = () => {
  const [state, setState] = useState<'play' | 'pause'>('play');

  const cycleState = () => {
    setState(current => {
      switch (current) {
        case 'play':
          return 'pause';
        case 'pause':
          return 'play';
        default:
          return 'play';
      }
    });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <AnimatedPlayIcon state={state} />
      <button onClick={cycleState}>Toggle State (Current: {state})</button>
    </div>
  );
};
