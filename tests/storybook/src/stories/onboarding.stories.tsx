import type { Input } from '@affine/component';
import { Onboarding } from '@affine/core/components/affine/onboarding/onboarding';
import type { Meta, StoryFn } from '@storybook/react';

export default {
  title: 'Preview/Onboarding',
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<typeof Input>;

export const Preview: StoryFn<typeof Onboarding> = () => {
  return <Onboarding />;
};
