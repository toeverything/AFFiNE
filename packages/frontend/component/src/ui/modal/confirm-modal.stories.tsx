import type { Meta } from '@storybook/react';

import { Button } from '../button';
import {
  ConfirmModal,
  type ConfirmModalProps,
  useConfirmModal,
  usePromptModal,
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
      confirmButtonOptions: {
        children: 'Confirm',
      },
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
      confirmButtonOptions: {
        children: 'Confirm',
      },
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

export const Prompt = () => {
  const openPrompt = usePromptModal();

  const showPrompt = async () => {
    const value = await openPrompt({
      placeholder: 'Enter your name',
      title: 'Give me a string',
      message: 'What is your name?',
    });
    if (value) {
      alert('your name is ' + value);
    }
  };

  return <Button onClick={showPrompt}>Show prompt</Button>;
};
