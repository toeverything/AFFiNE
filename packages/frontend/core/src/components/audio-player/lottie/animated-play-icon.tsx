import { Loading } from '@affine/component';
import clsx from 'clsx';
import type { LottieRef } from 'lottie-react';
import Lottie from 'lottie-react';
import { useEffect, useRef } from 'react';

import * as styles from './animated-play-icon.css';
import pausetoplay from './pausetoplay.json';
import playtopause from './playtopause.json';

export interface AnimatedPlayIconProps {
  state: 'play' | 'pause' | 'loading';
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const buildAnimatedLottieIcon = (data: Record<string, unknown>) => {
  const Component = ({
    onClick,
    className,
  }: {
    onClick?: (e: React.MouseEvent) => void;
    className?: string;
  }) => {
    const lottieRef: LottieRef = useRef(null);
    useEffect(() => {
      if (lottieRef.current) {
        const lottie = lottieRef.current;
        lottie.setSpeed(2);
        lottie.play();
      }
    }, []);
    return (
      <Lottie
        onClick={onClick}
        lottieRef={lottieRef}
        className={clsx(styles.root, className)}
        animationData={data}
        loop={false}
        autoplay={false}
      />
    );
  };
  return Component;
};

const PlayIcon = buildAnimatedLottieIcon(playtopause);
const PauseIcon = buildAnimatedLottieIcon(pausetoplay);

export const AnimatedPlayIcon = ({
  state,
  className,
  onClick,
}: AnimatedPlayIconProps) => {
  if (state === 'loading') {
    return <Loading size={40} />;
  }
  const Icon = state === 'play' ? PlayIcon : PauseIcon;
  return <Icon onClick={onClick} className={className} />;
};
