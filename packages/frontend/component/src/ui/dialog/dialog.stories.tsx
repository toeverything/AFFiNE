import { useCallback } from 'react';

import { Button } from '../button';
import { dialog } from './dialog';

export default {
  title: 'UI/Dialog',
};

const Template = (_: any) => {
  const openModal = useCallback(() => {
    dialog({
      component: <div>Modal Content</div>,
    });
  }, []);

  return <Button onClick={openModal}>Open Modal</Button>;
};

export const Basic = Template.bind(undefined);
