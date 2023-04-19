import type { Meta } from '@storybook/react';

import { AffineCloudTodoModal } from './index';
import { buttonStyle } from './index.css';

export default {
  title: 'components/affine-cloud-todo-button',
} as Meta;

export const Default = () => {
  return (
    <AffineCloudTodoModal>
      <button className={buttonStyle}>Enable Affine Cloud</button>
    </AffineCloudTodoModal>
  );
};
