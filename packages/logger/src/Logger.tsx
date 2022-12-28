import { useEffect } from 'react';

export const Logger = () => {
  useEffect(() => {
    console.log('@affine/logger: Render Track');
  }, []);

  return null;
};
