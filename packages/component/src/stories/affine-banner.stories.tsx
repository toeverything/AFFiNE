import type { StoryFn } from '@storybook/react';
import { useState } from 'react';

import { BrowserWarning, DownloadTips } from '../components/affine-banner';

export default {
  title: 'AFFiNE/Banner',
  component: BrowserWarning,
};

export const Default: StoryFn = () => {
  const [closed, setIsClosed] = useState(true);
  return (
    <div>
      <BrowserWarning
        message={<span>test</span>}
        show={closed}
        onClose={() => {
          setIsClosed(false);
        }}
      />
    </div>
  );
};

export const Download: StoryFn = () => {
  const [, setIsClosed] = useState(true);
  return (
    <div>
      <DownloadTips
        onClose={() => {
          setIsClosed(false);
        }}
      />
    </div>
  );
};
