import type { CSSProperties } from 'react';

import { articles } from './articles';
import { PaperSteps } from './paper-steps';
import * as styles from './style.css';

interface OnboardingProps {
  onOpenApp?: () => void;
}

export const Onboarding = (_: OnboardingProps) => {
  return (
    <div className={styles.onboarding} data-is-desktop={environment.isDesktop}>
      <div className={styles.offsetOrigin}>
        {Object.entries(articles).map(([id, article]) => {
          const { enterOptions, location } = article;
          const style = {
            '--fromX': `${enterOptions.fromX}vw`,
            '--fromY': `${enterOptions.fromY}vh`,
            '--fromZ': `${enterOptions.fromZ}px`,
            '--toZ': `${enterOptions.toZ}px`,
            '--fromRotateX': `${enterOptions.fromRotateX}deg`,
            '--fromRotateY': `${enterOptions.fromRotateY}deg`,
            '--fromRotateZ': `${enterOptions.fromRotateZ}deg`,
            '--toRotateZ': `${enterOptions.toRotateZ}deg`,

            '--delay': `${enterOptions.delay}ms`,
            '--duration': enterOptions.duration,
            '--easing': enterOptions.easing,

            '--offset-x': `${location.x || 0}px`,
            '--offset-y': `${location.y || 0}px`,
          } as CSSProperties;

          return (
            <div style={style} key={id}>
              <PaperSteps article={article} show={true} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
