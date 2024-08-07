import clsx from 'clsx';
import type { LottieRef } from 'lottie-react';
import Lottie from 'lottie-react';
import { useEffect, useRef } from 'react';

import animationData from './folder-icon.json';
import * as styles from './styles.css';

export interface FolderIconProps {
  open: boolean; // eg, when folder icon is a "dragged over" state
  className?: string;
  speed?: number;
}

// animated folder icon that has two states: closed and opened
export const AnimatedFolderIcon = ({
  open,
  className,
  speed = 0.5,
}: FolderIconProps) => {
  const lottieRef: LottieRef = useRef(null);

  useEffect(() => {
    if (lottieRef.current) {
      const lottie = lottieRef.current;
      lottie.setSpeed(speed);
      if (open) {
        lottie.setDirection(1);
      } else {
        lottie.setDirection(-1);
      }
      lottie.play();
    }
  }, [open, speed]);

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
