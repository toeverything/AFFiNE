import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import { Button } from '../button';
import { RadioGroup } from '../radio';
import type { TooltipProps } from './index';
import Tooltip from './index';

export default {
  title: 'UI/Tooltip',
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

const Template: StoryFn<TooltipProps> = args => (
  <Tooltip content="This is a tooltip" {...args}>
    <Button>Show tooltip</Button>
  </Tooltip>
);

export const Default: StoryFn<TooltipProps> = Template.bind(undefined);
Default.args = {};

export const WithShortCut = () => {
  const shortCuts = [
    ['Text', 'T'],
    ['Bold', ['⌘', 'B']],
    ['Quick Search', ['⌘', 'K']],
    ['Share', ['⌘', 'Shift', 'S']],
    ['Copy', ['$mod', '$shift', 'C']],
  ] as Array<[string, string | string[]]>;

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {shortCuts.map(([name, shortcut]) => (
        <Tooltip shortcut={shortcut} content={name} key={name}>
          <Button>{name}</Button>
        </Tooltip>
      ))}
    </div>
  );
};

export const CustomAlign = () => {
  const [align, setAlign] = useState('center' as const);
  const _ = undefined;
  const positions = [
    // [top, left, right, bottom, translateX, translateY]
    [0, 0, _, _, _, _],
    [0, '50%', _, _, '-50%', _],
    [0, _, 0, _, _, _],
    ['50%', 0, _, _, _, '-50%'],
    ['50%', _, 0, _, _, '-50%'],
    [_, 0, _, 0, _, _],
    [_, '50%', _, 0, '-50%', _],
    [_, _, 0, 0, _, _],
  ];
  return (
    <div>
      <RadioGroup
        items={['start', 'center', 'end']}
        value={align}
        onChange={setAlign}
      />
      <div
        style={{
          width: '100%',
          height: 200,
          position: 'relative',
          border: '1px solid rgba(100,100,100,0.2)',
          marginTop: 40,
        }}
      >
        {positions.map(pos => {
          const key = pos.join('-');
          const style = {
            position: 'absolute',
            top: pos[0],
            left: pos[1],
            right: pos[2],
            bottom: pos[3],
            transform: `translate(${pos[4] ?? 0}, ${pos[5] ?? 0})`,
          } as const;
          return (
            <Tooltip align={align} content="This is a tooltip" key={key}>
              <Button style={style}>Show tooltip</Button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export const WithCustomContent: StoryFn<TooltipProps> = args => (
  <Tooltip
    content={
      <ul>
        <li>This is a tooltip</li>
        <li style={{ color: 'red' }}>With custom content</li>
      </ul>
    }
    {...args}
  >
    <Button>Show tooltip</Button>
  </Tooltip>
);
