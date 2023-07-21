/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { IconButton, type IconButtonProps } from '@affine/component';
import { toast } from '@affine/component';
import { InformationIcon } from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';
export default {
  title: 'AFFiNE/IconButton',
  component: IconButton,
} as Meta<IconButtonProps>;

const IconButtonTemplate: StoryFn<IconButtonProps> = args => {
  return (
    <>
      <h1>This is icon button</h1>
      <IconButton {...args} />
    </>
  );
};

export const Icon = IconButtonTemplate.bind(undefined);
Icon.args = {
  children: <InformationIcon />,
  onClick: () => toast('Click button'),
  withoutPadding: true,
};
