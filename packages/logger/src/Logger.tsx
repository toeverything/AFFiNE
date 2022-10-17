import { useEffect } from 'react';

export const Logger = () => {
  useEffect(() => {
    console.log('@pathfinder/logger: Render Track');
  }, []);

  return null;
};
