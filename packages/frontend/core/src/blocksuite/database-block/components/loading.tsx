import { cssVarV2 } from '@toeverything/theme/v2';

import { progressCircle, progressSvg, spinnerAnimation } from './loading.css';

export const CircularProgress = ({ progress }: { progress: number }) => {
  const circumference = 2 * Math.PI * 10;

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className={progressSvg}>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={cssVarV2.loading.background}
        strokeWidth="4"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={cssVarV2.loading.foreground}
        strokeWidth="4"
        strokeDasharray={`${(progress / 100) * circumference} ${circumference}`}
        strokeLinecap="round"
        className={progressCircle}
      />
    </svg>
  );
};

export const Spinner = () => {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className={spinnerAnimation}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={cssVarV2.loading.background}
        strokeWidth="4"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={cssVarV2.loading.foreground}
        strokeWidth="4"
        strokeDasharray="15 85"
        strokeLinecap="round"
      />
    </svg>
  );
};
