import { Button } from '@affine/component';
import type { ContactModalProps } from '@affine/component/contact-modal';
import { ContactModal } from '@affine/component/contact-modal';
import type { StoryFn } from '@storybook/react';
import { useState } from 'react';

export default {
  title: 'AFFiNE/ContactModal',
  component: ContactModal,
};

export const Basic: StoryFn<ContactModalProps> = args => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </Button>
      <ContactModal
        {...args}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
};
Basic.args = {
  logoSrc: '/imgs/affine-text-logo.png',
};
