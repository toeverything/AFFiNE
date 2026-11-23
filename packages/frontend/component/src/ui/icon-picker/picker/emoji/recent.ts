import { useCallback, useEffect, useState } from 'react';

export const useRecentEmojis = () => {
  const [recentEmojis, setRecentEmojis] = useState<Array<string>>([]);

  useEffect(() => {
    const recentEmojis = localStorage.getItem('recentEmojis');
    setRecentEmojis(recentEmojis ? recentEmojis.split(',') : []);
  }, []);

  const add = useCallback((emoji: string) => {
    setRecentEmojis(prevRecentEmojis => {
      const newRecentEmojis = [
        emoji,
        ...prevRecentEmojis.filter(e => e !== emoji),
      ].slice(0, 10);
      localStorage.setItem('recentEmojis', newRecentEmojis.join(','));
      return newRecentEmojis;
    });
  }, []);

  return {
    recentEmojis,
    add,
  };
};
