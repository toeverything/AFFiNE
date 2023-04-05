import type { Meta } from '@storybook/react';

import { ColorScheme } from './ColorScheme';

export default {
  title: 'Color Scheme',
  component: ColorScheme,
} satisfies Meta;

export const Default = () => <ColorScheme />;
