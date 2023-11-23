import { BrowserWarning, LocalDemoTips } from '@affine/component/affine-banner';
import type { StoryFn } from '@storybook/react';
import { useState } from 'react';

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  return (
    <div>
      <LocalDemoTips
        isLoggedIn={isLoggedIn}
        onLogin={() => setIsLoggedIn(true)}
        onEnableCloud={() => {}}
        onClose={() => {
          setIsClosed(false);
        }}
      />
    </div>
  );
};
