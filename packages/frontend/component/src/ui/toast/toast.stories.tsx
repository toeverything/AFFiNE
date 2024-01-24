import { useCallback, useState } from 'react';

import { Button } from '../button';
import { toast } from './index';

export default {
  title: 'UI/Toast',
  component: () => null,
};

export const Default = () => {
  const [count, setCount] = useState(1);

  const showToast = useCallback(() => {
    toast(`Toast ${count}`);
    setCount(count + 1);
  }, [count]);

  return <Button onClick={showToast}>Show toast</Button>;
};
