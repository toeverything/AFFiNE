import { useEffect } from 'react';


export function useScrollRestoration(key: string, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const savedY = sessionStorage.getItem(`scroll-${key}`);
    if (ref.current && savedY) {
      ref.current.scrollTo(0, parseInt(savedY, 10));
    }

    const handleBeforeUnload = () => {
      if (ref.current) {
        sessionStorage.setItem(`scroll-${key}`, ref.current.scrollTop.toString());
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      handleBeforeUnload();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [key, ref]);
}
