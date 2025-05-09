import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import { AnimatedTranscribeIcon } from './animated-transcribe-icon';

export default {
  title: 'UI/Audio Player/Animated Transcribe Icon',
  component: AnimatedTranscribeIcon,
  parameters: {
    docs: {
      description: {
        component:
          'An animated icon that shows transcription state with smooth transitions.',
      },
    },
  },
} satisfies Meta<typeof AnimatedTranscribeIcon>;

const Template: StoryFn<typeof AnimatedTranscribeIcon> = args => (
  <AnimatedTranscribeIcon {...args} />
);

export const Idle = Template.bind({});
Idle.args = {
  state: 'idle',
};

export const Transcribing = Template.bind({});
Transcribing.args = {
  state: 'transcribing',
};

export const WithStateToggle: StoryFn<typeof AnimatedTranscribeIcon> = () => {
  const [state, setState] = useState<'idle' | 'transcribing'>('idle');

  const toggleState = () => {
    setState(current => (current === 'idle' ? 'transcribing' : 'idle'));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <AnimatedTranscribeIcon state={state} />
      <button onClick={toggleState}>Toggle State (Current: {state})</button>
    </div>
  );
};
