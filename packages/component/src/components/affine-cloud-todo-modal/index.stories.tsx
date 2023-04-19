import type { Meta } from '@storybook/react';

import { AffineCloudTodoModal } from './index';

export default {
  title: 'components/affine-cloud-todo-button',
} as Meta;

export const Default = () => {
  return (
    <AffineCloudTodoModal>
      <button>Enable Affine Cloud</button>
    </AffineCloudTodoModal>
  );
};
