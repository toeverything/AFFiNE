import { CameraIcon } from '@blocksuite/icons/rc';
import type { Meta, StoryFn } from '@storybook/react';

import type { AvatarProps } from './avatar';
import { Avatar } from './avatar';

export default {
  title: 'UI/Avatar',
  component: Avatar,
  argTypes: {
    onClick: () => console.log('Click button'),
  },
} satisfies Meta<AvatarProps>;

const Template: StoryFn<AvatarProps> = args => <Avatar {...args} />;

export const DefaultAvatar: StoryFn<AvatarProps> = Template.bind(undefined);
DefaultAvatar.args = {
  name: 'AFFiNE',
  url: 'https://affine.pro/favicon-96.png',
  size: 50,
};
export const Fallback: StoryFn<AvatarProps> = Template.bind(undefined);
Fallback.args = {
  name: 'AFFiNE',
  size: 50,
};
export const ColorfulFallback: StoryFn<AvatarProps> = Template.bind(undefined);
ColorfulFallback.args = {
  size: 50,
  colorfulFallback: true,
  name: 'blocksuite',
};
export const ColorfulFallbackWithDifferentSize: StoryFn<AvatarProps> = args => (
  <>
    <Avatar {...args} size={20} colorfulFallback name="AFFiNE" />
    <Avatar {...args} size={40} colorfulFallback name="AFFiNE" />
    <Avatar {...args} size={60} colorfulFallback name="AFFiNE" />
  </>
);
export const WithHover: StoryFn<AvatarProps> = Template.bind(undefined);
WithHover.args = {
  size: 50,
  colorfulFallback: true,
  name: 'With Hover',
  hoverIcon: <CameraIcon />,
};

export const WithRemove: StoryFn<AvatarProps> = Template.bind(undefined);
WithRemove.args = {
  size: 50,
  colorfulFallback: true,
  name: 'With Hover',
  hoverIcon: <CameraIcon />,
  removeTooltipOptions: { content: 'This is remove tooltip' },
  avatarTooltipOptions: { content: 'This is avatar tooltip' },
  onRemove: e => {
    console.log('on remove', e);
  },
};

const img =
  'data:image/png;base64,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';

export const CustomizeBorderRadius: StoryFn<AvatarProps> = args => (
  <div style={{ display: 'flex', gap: 4 }}>
    <Avatar {...args} size={60} colorfulFallback name="AFFiNE" rounded={10} />
    <Avatar {...args} size={60} url={img} rounded="10px" />
    <Avatar {...args} size={60} rounded={'5%'} name="C" />
  </div>
);
