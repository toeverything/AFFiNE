import type { StoryFn } from '@storybook/react';

import { ChangeLog } from '../components/changeLog';

export default {
  title: 'AFFiNE/ChangeLog',
  component: ChangeLog,
};

export const Default: StoryFn = () => (
  <div
    style={{
      width: '256px',
      height: '100vh',
    }}
  >
    <ChangeLog onCloseWhatsNew={() => {}} />
  </div>
);
