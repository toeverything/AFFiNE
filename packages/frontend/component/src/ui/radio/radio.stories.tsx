import { AiIcon, FrameIcon, TocIcon, TodayIcon } from '@blocksuite/icons/rc';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useState } from 'react';

import { ResizePanel } from '../resize-panel/resize-panel';
import { RadioGroup } from './radio';
import type { RadioItem } from './types';

export default {
  title: 'UI/RadioGroup',
};

export const FixedWidth = () => {
  const [value, setValue] = useState('Radio 1');
  return (
    <>
      <p style={{ marginBottom: 10, fontSize: cssVar('fontXs') }}>
        width:&nbsp;
        <code
          style={{
            padding: '2px 4px',
            borderRadius: 3,
            background: cssVar('hoverColorFilled'),
          }}
        >
          300px
        </code>
      </p>
      <RadioGroup
        width={300}
        value={value}
        onChange={setValue}
        items={['Radio 1', 'Radio 2, Longer', 'S3']}
      />
    </>
  );
};

export const AutoWidth = () => {
  const [value, setValue] = useState('Radio 1');
  return (
    <RadioGroup
      value={value}
      onChange={setValue}
      items={['Radio 1', 'Radio 2, Longer', 'S3']}
    />
  );
};

export const DynamicWidth = () => {
  const [value, setValue] = useState('Radio 1');
  return (
    <ResizePanel
      horizontal
      vertical={false}
      maxWidth={1080}
      minWidth={235}
      width={250}
    >
      <RadioGroup
        width="100%"
        value={value}
        onChange={setValue}
        items={['Radio 1', 'Radio 2, Longer', 'S3']}
      />
    </ResizePanel>
  );
};

export const IconTabs = () => {
  const [value, setValue] = useState('ai');
  const items: RadioItem[] = [
    {
      value: 'ai',
      label: <AiIcon width={20} height={20} />,
      style: { width: 28 },
      testId: 'ai-radio',
    },
    {
      value: 'calendar',
      label: <TodayIcon width={20} height={20} />,
      style: { width: 28 },
      testId: 'calendar-radio',
    },
    {
      value: 'outline',
      label: <TocIcon width={20} height={20} />,
      style: { width: 28 },
      testId: 'outline-radio',
    },
    {
      value: 'frame',
      label: <FrameIcon width={20} height={20} />,
      style: { width: 28 },
      testId: 'frame-radio',
    },
  ];
  return (
    <RadioGroup
      value={value}
      onChange={setValue}
      items={items}
      padding={4}
      borderRadius={12}
      gap={8}
    />
  );
};

export const CustomizeActiveStyle = () => {
  const [value, setValue] = useState('ai');
  const items: RadioItem[] = [
    {
      value: 'ai',
      label: <AiIcon width={20} height={20} />,
      style: { width: 28 },
      testId: 'ai-radio',
    },
    {
      value: 'calendar',
      label: <TodayIcon width={20} height={20} />,
      style: { width: 28 },
      testId: 'calendar-radio',
    },
    {
      value: 'outline',
      label: <TocIcon width={20} height={20} />,
      style: { width: 28 },
      testId: 'outline-radio',
    },
    {
      value: 'frame',
      label: <FrameIcon width={20} height={20} />,
      style: { width: 28 },
      testId: 'frame-radio',
    },
  ];
  return (
    <RadioGroup
      activeItemStyle={{ color: cssVar('primaryColor') }}
      value={value}
      onChange={setValue}
      items={items}
      padding={4}
      borderRadius={12}
      gap={8}
    />
  );
};

const shapes = [
  'Square',
  'Ellipse',
  'Diamond',
  'Triangle',
  'Rounded ',
  'Rectangle',
];
export const ShapeSelectorDemo = () => {
  const [shape, setShape] = useState(shapes[0]);
  return (
    <RadioGroup
      padding={0}
      gap={4}
      itemHeight={28}
      borderRadius={8}
      value={shape}
      items={shapes}
      onChange={setShape}
      style={{ background: 'transparent' }}
      indicatorStyle={{
        boxShadow: 'none',
        backgroundColor: cssVarV2('layer/background/tertiary'),
      }}
    />
  );
};
