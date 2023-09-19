import { CMDKModal } from '@affine/core/components/pure/cmdk';
import type { Meta, StoryFn } from '@storybook/react';
import { Button } from '@toeverything/components/button';
import { useState } from 'react';

export default {
  title: 'AFFiNE/QuickSearch/CMDKModal',
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

export const CMDKModalStory: StoryFn = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Modal</Button>
      <CMDKModal open={open} onOpenChange={setOpen}>
        CONTENTS
      </CMDKModal>
    </>
  );
};

CMDKModalStory.args = {
  open: true,
};
