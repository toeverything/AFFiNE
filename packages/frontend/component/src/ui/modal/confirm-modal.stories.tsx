import type { Meta } from '@storybook/react';

import { Button } from '../button';
import {
  ConfirmModal,
  type ConfirmModalProps,
  useConfirmModal,
} from './confirm-modal';

export default {
  title: 'UI/Modal/Confirm Modal',
  component: ConfirmModal,
  argTypes: {},
} satisfies Meta<ConfirmModalProps>;

export const UsingHook = () => {
  const { openConfirmModal } = useConfirmModal();

  const onConfirm = () =>
    new Promise<void>(resolve => setTimeout(resolve, 2000));

  const showConfirm = () => {
    openConfirmModal({
      cancelText: 'Cancel',
      confirmText: 'Confirm',
      title: 'Confirm Modal',
      children: 'Are you sure you want to confirm?',
      onConfirm,
      onCancel: () => {
        console.log('Cancelled');
      },
    });
  };

  return <Button onClick={showConfirm}>Show confirm</Button>;
};

export const AutoClose = () => {
  const { openConfirmModal } = useConfirmModal();

  const onConfirm = () => {
    openConfirmModal({
      cancelText: 'Cancel',
      confirmText: 'Confirm',
      title: 'Confirm Modal',
      children: 'Are you sure you want to confirm?',
      onConfirm: () => console.log('Confirmed'),
      onCancel: () => {
        console.log('Cancelled');
      },
    });
  };

  return <Button onClick={onConfirm}>Show confirm</Button>;
};
