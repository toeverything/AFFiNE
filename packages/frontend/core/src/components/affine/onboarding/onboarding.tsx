import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';

import { AnimateInTooltip } from './animate-in-tooltip';
import { articles } from './articles';
import { PaperSteps } from './paper-steps';
import * as styles from './style.css';
import type { ArticleId, ArticleOption, OnboardingStatus } from './types';

interface OnboardingProps {
  onOpenApp?: () => void;
}

export const Onboarding = ({ onOpenApp }: OnboardingProps) => {
  const [status, setStatus] = useState<OnboardingStatus>({
    activeId: null,
    unfoldingId: null,
  });

  const onFoldChange = useCallback((id: ArticleId, v: boolean) => {
    setStatus(s => {
      return {
        activeId: v ? null : s.activeId,
        unfoldingId: v ? s.unfoldingId : id,
      };
    });
  }, []);

  const onFoldChanged = useCallback((id: ArticleId, v: boolean) => {
    setStatus(s => {
      return {
        activeId: v ? null : id,
        unfoldingId: v ? null : s.unfoldingId,
      };
    });
  }, []);

  const onTooltipNext = useCallback(() => {
    if (status.activeId) return;
    setStatus({ activeId: null, unfoldingId: '4' });
  }, [status.activeId]);

  return (
    <div
      className={styles.onboarding}
      data-is-desktop={BUILD_CONFIG.isElectron}
      data-is-window={!!status.activeId || !!status.unfoldingId}
    >
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
                  status={status}
                  article={article}
                  show={status.activeId === null || status.activeId === id}
                  onFoldChange={onFoldChange}
                  onFoldChanged={onFoldChanged}
                  onOpenApp={onOpenApp}
                />
              </div>
            );
          }
        )}

        <div className={styles.tipsWrapper} data-visible={!status.activeId}>
          <AnimateInTooltip onNext={onTooltipNext} visible={!status.activeId} />
        </div>
      </div>
    </div>
  );
};
