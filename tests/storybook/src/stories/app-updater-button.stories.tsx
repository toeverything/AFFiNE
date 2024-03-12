import {
  type AddPageButtonProps,
  AppUpdaterButton,
} from '@affine/core/components/app-sidebar';
import type { Meta, StoryFn } from '@storybook/react';
import type { PropsWithChildren } from 'react';

export default {
  title: 'AFFiNE/AppUpdaterButton',
  component: AppUpdaterButton,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<typeof AppUpdaterButton>;

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

export const Default: StoryFn<AddPageButtonProps> = props => {
  return (
    <Container>
      <AppUpdaterButton {...props} />
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
  changelogUnread: true,
  autoDownload: false,
};

export const Updated: StoryFn<AddPageButtonProps> = props => {
  return (
    <Container>
      <AppUpdaterButton {...props} updateAvailable={null} />
    </Container>
  );
};

Updated.args = {
  changelogUnread: true,
};
