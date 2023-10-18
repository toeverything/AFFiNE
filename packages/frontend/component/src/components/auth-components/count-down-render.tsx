import { forwardRef, type HTMLAttributes } from 'react';

const formatTime = (time: number): string => {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;

  const formattedMinutes = minutes.toString().padStart(2, '0');
  const formattedSeconds = seconds.toString().padStart(2, '0');

  return `${formattedMinutes}:${formattedSeconds}`;
};

export const CountDownRender = forwardRef<
  HTMLDivElement,
  { timeLeft: number } & HTMLAttributes<HTMLDivElement>
>(({ timeLeft, ...props }, ref) => {
  return (
    <div {...props} ref={ref}>
      {formatTime(timeLeft)}
    </div>
  );
});

CountDownRender.displayName = 'CountDownRender';
