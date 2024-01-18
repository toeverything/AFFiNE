import type { Meta, StoryFn } from '@storybook/react';
import dayjs from 'dayjs';
import { useState } from 'react';

import { ResizePanel } from '../resize-panel/resize-panel';
import { WeekDatePicker } from './week-date-picker';

export default {
  title: 'UI/Date Picker/Week Date Picker',
} satisfies Meta<typeof WeekDatePicker>;

const _format = 'YYYY-MM-DD';

const Template: StoryFn<typeof WeekDatePicker> = args => {
  const [date, setDate] = useState(dayjs().format(_format));
  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ marginBottom: 20 }}>Selected Date: {date}</div>

      <ResizePanel
        width={600}
        height={56}
        minHeight={56}
        minWidth={100}
        maxWidth={1400}
        horizontal={true}
        vertical={false}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'stretch',
        }}
      >
        <WeekDatePicker
          style={{ width: '100%' }}
          value={date}
          {...args}
          onChange={e => {
            setDate(dayjs(e, _format).format(_format));
          }}
        />
      </ResizePanel>
    </div>
  );
};

export const Basic: StoryFn<typeof WeekDatePicker> = Template.bind(undefined);
Basic.args = {};
