import { type CSSProperties, useCallback, useState } from 'react';

import { articles } from './articles';
import { PaperSteps } from './paper-steps';
import * as styles from './style.css';
import type { ArticleId, ArticleOption } from './types';

interface OnboardingProps {
  onOpenApp?: () => void;
}

export const Onboarding = (_: OnboardingProps) => {
  const [status, setStatus] = useState<{
    activeId: ArticleId | null;
    unfoldingId: ArticleId | null;
  }>({ activeId: null, unfoldingId: null });

  const onFoldChange = useCallback((id: ArticleId, v: boolean) => {
    setStatus(s => {
      return {
        activeId: v ? null : s.activeId,
        unfoldingId: v ? null : id,
      };
    });
  }, []);

  const onFoldChanged = useCallback((id: ArticleId, v: boolean) => {
    setStatus(s => {
      return {
        activeId: v ? null : id,
        unfoldingId: s.unfoldingId,
      };
    });
  }, []);

  return (
    <div className={styles.onboarding} data-is-desktop={environment.isDesktop}>
      <div className={styles.offsetOrigin}>
        {(Object.entries(articles) as Array<[ArticleId, ArticleOption]>).map(
          ([id, article]) => {
            const { enterOptions, location } = article;
            const style = {
              zIndex: status.unfoldingId === id ? 1 : 0,

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
                <PaperSteps
                  article={article}
                  show={status.activeId === null || status.activeId === id}
                  onFoldChange={onFoldChange}
                  onFoldChanged={onFoldChanged}
                />
              </div>
            );
          }
        )}
      </div>
    </div>
  );
};
