import clsx from 'clsx';
import type { LottieRef } from 'lottie-react';
import Lottie from 'lottie-react';
import { useEffect, useRef } from 'react';

import animationData from './folder-icon.json';
import * as styles from './styles.css';

export interface FolderIconProps {
  closed: boolean; // eg, when folder icon is a "dragged over" state
  className?: string;
}

// animated folder icon that has two states: closed and opened
export const AnimatedFolderIcon = ({ closed, className }: FolderIconProps) => {
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
