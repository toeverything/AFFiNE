import type { Meta, StoryFn } from '@storybook/react';
import dayjs from 'dayjs';
import { useState } from 'react';

import { AFFiNEDatePicker } from '.';

export default {
  title: 'UI/Date Picker/Date Picker',
} satisfies Meta<typeof AFFiNEDatePicker>;

const _format = 'YYYY-MM-DD';

const Template: StoryFn<typeof AFFiNEDatePicker> = args => {
  const [date, setDate] = useState(dayjs().format(_format));
  return (
    <div style={{ minHeight: 400, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>Selected Date: {date}</div>

      <AFFiNEDatePicker
        value={date}
        {...args}
        onChange={e => {
          setDate(dayjs(e, _format).format(_format));
        }}
      />
    </div>
  );
};

export const Basic: StoryFn<typeof AFFiNEDatePicker> = Template.bind(undefined);
Basic.args = {};

export const Inline: StoryFn<typeof AFFiNEDatePicker> =
  Template.bind(undefined);
Inline.args = {
  inline: true,
};
