import { Button } from '@affine/component/ui/button';
import { CMDKContainer, CMDKModal } from '@affine/core/components/pure/cmdk';
import { useCMDKCommandGroups } from '@affine/core/components/pure/cmdk/data-hooks';
import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

export default {
  title: 'AFFiNE/QuickSearch',
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

export const CMDKModalStory: StoryFn = () => {
  const [open, setOpen] = useState(false);
  const [counter, setCounter] = useState(0);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Modal</Button>
      <CMDKModal key={counter} open={open} onOpenChange={setOpen}>
        <Button onClick={() => setCounter(c => c + 1)}>
          Trigger new modal
        </Button>
      </CMDKModal>
    </>
  );
};

export const CMDKPanelStory: StoryFn = () => {
  const [query, setQuery] = useState('');
  const groups = useCMDKCommandGroups();
  return (
    <CMDKModal open>
      <CMDKContainer
        open
        query={query}
        onQueryChange={setQuery}
        groups={groups}
      />
    </CMDKModal>
  );
};
