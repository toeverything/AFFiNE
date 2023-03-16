import lottie from 'lottie-web';
import type { FC } from 'react';
import { useEffect, useRef } from 'react';

type CustomLottieProps = {
  options: {
    loop?: boolean | number | undefined;
    autoplay?: boolean | undefined;
    animationData: any;
    rendererSettings?: {
      preserveAspectRatio?: string | undefined;
    };
  };
  isStopped?: boolean | undefined;
  speed?: number | undefined;
  width?: number | string | undefined;
  height?: number | string | undefined;
};

const CustomLottie: FC<CustomLottieProps> = ({
  options,
  isStopped,
  speed,
  width,
  height,
}) => {
  const element = useRef<HTMLDivElement>(null);
  const lottieInstance = useRef<any>();

  useEffect(() => {
    if (element.current) {
      lottieInstance.current = lottie.loadAnimation({
        ...options,
        container: element.current,
      });
    }
    return () => {
      lottieInstance.current?.destroy();
    };
  }, [options]);

  useEffect(() => {
    if (speed) {
      lottieInstance.current?.setSpeed(speed);
    }
    if (isStopped) {
      lottieInstance.current?.stop();
    } else {
      lottieInstance.current?.play();
    }
  }, [isStopped, speed]);

  return <div ref={element} style={{ width, height }}></div>;
};
export default CustomLottie;
