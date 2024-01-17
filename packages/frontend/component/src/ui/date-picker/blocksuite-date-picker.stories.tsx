import type { Meta, StoryFn } from '@storybook/react';

import { BlocksuiteDatePicker } from './blocksuite-date-picker';

export default {
  title: 'UI/Date Picker/Blocksuite Date Picker',
} satisfies Meta<typeof BlocksuiteDatePicker>;

export const Basic: StoryFn<typeof BlocksuiteDatePicker> = () => {
  return (
    <div style={{ width: 300 }}>
      <BlocksuiteDatePicker />
    </div>
  );
};
