import { AFFiNEDatePicker } from '@affine/component';
import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

export default {
  title: 'AFFiNE/AFFiNEDatePicker',
  component: AFFiNEDatePicker,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<typeof AFFiNEDatePicker>;

export const Default: StoryFn = () => {
  const [value, setValue] = useState<string>(new Date().toString());
  return <AFFiNEDatePicker value={value} onChange={setValue} />;
};
