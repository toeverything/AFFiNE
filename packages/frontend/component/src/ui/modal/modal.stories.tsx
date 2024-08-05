import type { Meta, StoryFn } from '@storybook/react';
import { useCallback, useState } from 'react';

import { Button } from '../button';
import type { InputProps } from '../input';
import { Input } from '../input';
import type { ConfirmModalProps } from './confirm-modal';
import { ConfirmModal } from './confirm-modal';
import type { ModalProps } from './modal';
import { Modal } from './modal';
import type { OverlayModalProps } from './overlay-modal';
import { OverlayModal } from './overlay-modal';

export default {
  title: 'UI/Modal',
  component: Modal,
  argTypes: {},
} satisfies Meta<ModalProps>;

const Template: StoryFn<ModalProps> = args => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Modal</Button>
      <Modal open={open} onOpenChange={setOpen} {...args} />
    </>
  );
};

export const Default: StoryFn<ModalProps> = Template.bind(undefined);
Default.args = {
  title: 'Modal Title',
  description:
    'If the day is done, if birds sing no more, if the wind has flagged tired, then draw the veil of darkness thick upon me, even as thou hast wrapt the earth with the coverlet of sleep and tenderly closed the petals of the drooping lotus at dusk.',
};

const wait = () => new Promise(resolve => setTimeout(resolve, 1000));
const ConfirmModalTemplate: StoryFn<ConfirmModalProps> = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputStatus, setInputStatus] =
    useState<InputProps['status']>('default');

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    await wait();
    setInputStatus(inputStatus !== 'error' ? 'error' : 'success');
    setLoading(false);
  }, [inputStatus]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Confirm Modal</Button>
      <ConfirmModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleConfirm}
        title="Modal Title"
        description="Modal description"
        confirmText="Confirm"
        confirmButtonOptions={{
          loading: loading,
          variant: 'primary',
        }}
      >
        <Input placeholder="input someting" status={inputStatus} />
      </ConfirmModal>
    </>
  );
};

const OverlayModalTemplate: StoryFn<OverlayModalProps> = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Overlay Modal</Button>
      <OverlayModal
        open={open}
        onOpenChange={setOpen}
        title="Modal Title"
        description="Modal description"
        confirmButtonOptions={{
          variant: 'primary',
        }}
        topImage={
          <div
            style={{
              width: '400px',
              height: '300px',
              background: '#66ccff',
              opacity: 0.1,
              color: '#fff',
            }}
          ></div>
        }
      />
    </>
  );
};

export const Confirm: StoryFn<ModalProps> =
  ConfirmModalTemplate.bind(undefined);

export const Overlay: StoryFn<ModalProps> =
  OverlayModalTemplate.bind(undefined);
