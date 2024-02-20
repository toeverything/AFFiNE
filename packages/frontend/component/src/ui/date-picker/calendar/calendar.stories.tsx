import type { Meta, StoryFn } from '@storybook/react';
import dayjs from 'dayjs';
import { useState } from 'react';

import { ResizePanel } from '../../resize-panel/resize-panel';
import { DatePicker } from '.';

export default {
  title: 'UI/Date Picker/Date Picker',
} satisfies Meta<typeof DatePicker>;

const _format = 'YYYY-MM-DD';

const Template: StoryFn<typeof DatePicker> = args => {
  const [date, setDate] = useState(dayjs().format(_format));
  return (
    <div style={{ minHeight: 400, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>Selected Date: {date}</div>

      <ResizePanel
        horizontal
        vertical={false}
        width={256}
        minWidth={256 + 8 * 2}
        maxWidth={1200}
      >
        <DatePicker value={date} onChange={setDate} {...args} />
      </ResizePanel>
    </div>
  );
};

export const Basic: StoryFn<typeof DatePicker> = Template.bind(undefined);
Basic.args = {
  format: 'YYYYMMDD',
  gapX: 8,
  gapY: 8,
  monthNames: 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
  weekDays: 'Su,Mo,Tu,We,Th,Fr,Sa',
};
