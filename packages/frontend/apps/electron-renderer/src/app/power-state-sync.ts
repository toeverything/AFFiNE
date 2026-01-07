import { useEffect, useState } from 'react';

import { usePowerState } from './hooks/use-power-state';

export const DesktopPowerStateSync = () => {
  const onBattery = usePowerState();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // Fallback for older browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  useEffect(() => {
    const enableAnimations = !onBattery && !prefersReducedMotion;
    document.documentElement.classList.toggle(
      'reduce-motion',
      !enableAnimations
    );
  }, [onBattery, prefersReducedMotion]);

  return null;
};
