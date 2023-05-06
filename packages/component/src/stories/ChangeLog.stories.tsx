import type { StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';
import { useState } from 'react';

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

export const Close: StoryFn = () => {
  const [closed, setIsClosed] = useState(false);
  return (
    <>
      <div>Closed: {closed ? 'true' : 'false'}</div>
      <div
        style={{
          width: '256px',
          height: '100vh',
        }}
      >
        <ChangeLog
          onCloseWhatsNew={() => {
            setIsClosed(true);
          }}
        />
      </div>
    </>
  );
};

Close.play = async ({ canvasElement }) => {
  const element = within(canvasElement);
  await new Promise(resolve => setTimeout(resolve, 2000));
  element.getByTestId('change-log-close-button').click();
};
