import clsx from 'clsx';
import type { LottieRef } from 'lottie-react';
import Lottie from 'lottie-react';
import { useEffect, useRef } from 'react';

import animationData from './collections-icon.json';
import * as styles from './styles.css';

export interface CollectionsIconProps {
  closed: boolean; // eg, when collections icon is a "dragged over" state
  className?: string;
}

// animated collections icon that has two states: closed and opened
export const AnimatedCollectionsIcon = ({
  closed,
  className,
}: CollectionsIconProps) => {
  const lottieRef: LottieRef = useRef(null);

  useEffect(() => {
    if (lottieRef.current) {
      const lottie = lottieRef.current;
      if (closed) {
        lottie.setDirection(1);
      } else {
        lottie.setDirection(-1);
      }
      lottie.play();
    }
  }, [closed]);

  return (
    <Lottie
      className={clsx(styles.root, className)}
      autoPlay={false}
      loop={false}
      lottieRef={lottieRef}
      animationData={animationData}
    />
  );
};
