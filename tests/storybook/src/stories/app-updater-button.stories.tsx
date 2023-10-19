import {
  type AddPageButtonPureProps,
  AppUpdaterButtonPure,
} from '@affine/component/app-sidebar';
import type { Meta, StoryFn } from '@storybook/react';
import type { PropsWithChildren } from 'react';

export default {
  title: 'AFFiNE/AppUpdaterButton',
  component: AppUpdaterButtonPure,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<typeof AppUpdaterButtonPure>;

const Container = ({ children }: PropsWithChildren) => (
  <main
    style={{
      position: 'relative',
      width: '320px',
      display: 'flex',
      flexDirection: 'row',
      backgroundColor: '#eee',
      padding: '16px',
    }}
  >
    {children}
  </main>
);

export const Default: StoryFn<AddPageButtonPureProps> = props => {
  return (
    <Container>
      <AppUpdaterButtonPure {...props} />
    </Container>
  );
};

Default.args = {
  appQuitting: false,
  updateReady: true,
  updateAvailable: {
    version: '1.0.0-beta.1',
    allowAutoUpdate: true,
  },
  downloadProgress: 42,
  currentChangelogUnread: true,
};

export const Updated: StoryFn<AddPageButtonPureProps> = props => {
  return (
    <Container>
      <AppUpdaterButtonPure {...props} updateAvailable={null} />
    </Container>
  );
};

Updated.args = {
  currentChangelogUnread: true,
};
