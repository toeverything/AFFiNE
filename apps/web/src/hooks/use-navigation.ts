import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

function useNavigation() {
  const router = useRouter();
  const [history, setHistory] = useState([router.asPath]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      if (!navigating) {
        setHistory(oldHistory => {
          const newHistory = oldHistory.slice(0, currentIndex + 1);
          newHistory.push(url);
          return newHistory;
        });
        setCurrentIndex(oldIndex => oldIndex + 1);
      } else {
        setNavigating(false);
      }
    };

    router.events.on('routeChangeComplete', handleRouteChange);

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [currentIndex, navigating, router]);
  console.log('useNavigation', { history, currentIndex, navigating });

  const goBack = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      setNavigating(true);
      router.back();
    }
  };

  const goForward = () => {
    if (currentIndex < history.length - 1) {
      const newIndex = currentIndex + 1;
      router.push(history[newIndex]);
      setCurrentIndex(newIndex);
    }
  };

  return {
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex < history.length - 1,
    goBack,
    goForward,
  };
}

export default useNavigation;
