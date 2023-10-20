import { Input } from '@affine/component';
import { expect } from '@storybook/jest';
import type { Meta, StoryFn } from '@storybook/react';
import { userEvent, within } from '@storybook/testing-library';

export default {
  title: 'AFFiNE/Input',
  component: Input,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<typeof Input>;

export const Basic: StoryFn<typeof Input> = () => {
  return <Input data-testid="test-input" defaultValue="test" />;
};

Basic.play = async ({ canvasElement }) => {
  const element = within(canvasElement);
  const item = element.getByTestId('test-input') as HTMLInputElement;
  expect(item).toBeTruthy();
  expect(item.value).toBe('test');
  await userEvent.clear(item);
  await userEvent.type(item, 'test 2');
  expect(item.value).toBe('test 2');
};

export const DynamicHeight: StoryFn<typeof Input> = () => {
  return <Input width={200} data-testid="test-input" />;
};

DynamicHeight.play = async ({ canvasElement }) => {
  const element = within(canvasElement);
  const item = element.getByTestId('test-input') as HTMLInputElement;
  expect(item).toBeTruthy();
  // FIXME: the following is not correct
  // expect(item.getBoundingClientRect().width).toBe(200);
};

export const NoBorder: StoryFn<typeof Input> = () => {
  return <Input noBorder={true} data-testid="test-input" />;
};
