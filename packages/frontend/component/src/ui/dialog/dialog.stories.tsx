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

export const ConfirmAsync = () => {
  const onConfirm = useCallback(() => {
    return new Promise(resolve => setTimeout(() => resolve(1), 2000));
  }, []);

  const showConfirm = useCallback(() => {
    dialog.confirm({
      title: 'Confirm',
      description: 'Are you sure?',
      confirmButtonOptions: {
        children: 'Yes',
      },
      cancelText: 'No',
      onConfirm,
    });
  }, [onConfirm]);

  return <Button onClick={showConfirm}>Show Confirm</Button>;
};

export const ConfirmSync = () => {
  const onConfirm = useCallback(() => {
    console.log('Confirmed');
    return null;
  }, []);

  const showConfirm = useCallback(() => {
    dialog.confirm({
      title: 'Confirm',
      description: 'Are you sure?',
      confirmButtonOptions: {
        children: 'Yes',
      },
      cancelText: 'No',
      onConfirm,
    });
  }, [onConfirm]);

  return <Button onClick={showConfirm}>Show Confirm</Button>;
};
