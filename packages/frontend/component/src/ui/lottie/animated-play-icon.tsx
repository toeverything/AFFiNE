import clsx from 'clsx';
import { useDebouncedValue } from 'foxact/use-debounced-value';
import type { LottieRef } from 'lottie-react';
import Lottie from 'lottie-react';
import { useEffect, useRef } from 'react';

import playandpause from './playandpause.json';
import * as styles from './styles.css';

export interface AnimatedPlayIconProps {
  state: 'play' | 'pause';
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const PlayAndPauseIcon = ({
  onClick,
  className,
  state,
}: {
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  state: 'play' | 'pause';
}) => {
  const lottieRef: LottieRef = useRef(null);
  const prevStateRef = useRef(state);

  useEffect(() => {
    if (!lottieRef.current) return;
    const lottie = lottieRef.current;
    if (prevStateRef.current === 'pause') {
      lottie.goToAndStop(100, true);
    }
  }, []);

  useEffect(() => {
    if (!lottieRef.current) return;
    const lottie = lottieRef.current;
    lottie.setSpeed(2);

    // Only animate if state actually changed
    if (prevStateRef.current !== state) {
      if (state === 'play') {
        // Animate from pause to play
        lottie.playSegments([120, 160], true);
      } else {
        // Animate from play to pause
        lottie.playSegments([60, 100], true);
      }
      prevStateRef.current = state;
    }
  }, [state]);

  return (
    <Lottie
      onClick={onClick}
      lottieRef={lottieRef}
      className={clsx(styles.root, className)}
      animationData={playandpause}
      loop={false}
      autoplay={false}
    />
  );
};

export const AnimatedPlayIcon = ({
  state: _state,
  className,
  onClick,
}: AnimatedPlayIconProps) => {
  const state = useDebouncedValue(_state, 25);
  return (
    <PlayAndPauseIcon state={state} onClick={onClick} className={className} />
  );
};
