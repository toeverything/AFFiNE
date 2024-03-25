import { useCallback, useEffect, useState } from 'react';

import { AnimateIn } from './steps/animate-in';
import { EdgelessSwitch } from './steps/edgeless-switch';
import { Unfolding } from './steps/unfolding';
import type {
  ArticleId,
  ArticleOption,
  OnboardingStatus,
  OnboardingStep,
} from './types';

interface PaperStepsProps {
  show?: boolean;
  article: ArticleOption;
  status: OnboardingStatus;
  onFoldChange?: (id: ArticleId, v: boolean) => void;
  onFoldChanged?: (id: ArticleId, v: boolean) => void;
  onOpenApp?: () => void;
}

export const PaperSteps = ({
  show,
  article,
  status,
  onFoldChange,
  onFoldChanged,
  onOpenApp,
}: PaperStepsProps) => {
  const [stage, setStage] = useState<OnboardingStep>('enter');
  const [fold, setFold] = useState(true);

  const onEntered = useCallback(() => {
    setStage('unfold');
  }, []);

  const _onFoldChange = useCallback(
    (v: boolean) => {
      setFold(v);
      onFoldChange?.(article.id, v);
    },
    [onFoldChange, article.id]
  );

  const _onFoldChanged = useCallback(
    (v: boolean) => {
      onFoldChanged?.(article.id, v);
      if (!v) setStage('edgeless-switch');
    },
    [onFoldChanged, article.id]
  );

  const onEdgelessSwitchBack = useCallback(() => {
    setFold(false);
    setStage('unfold');
    // to apply fold animation
    setTimeout(() => _onFoldChange(true));
  }, [_onFoldChange]);

  useEffect(() => {
    if (stage === 'unfold' && status.unfoldingId === article.id) {
      setFold(false);
    }
  }, [article.id, stage, status.unfoldingId]);

  if (!show) return null;
  return stage === 'enter' ? (
    <AnimateIn article={article} onFinished={onEntered} />
  ) : stage === 'unfold' ? (
    <Unfolding
      fold={fold}
      article={article}
      onChange={_onFoldChange}
      onChanged={_onFoldChanged}
    />
  ) : (
    <EdgelessSwitch
      article={article}
      onBack={onEdgelessSwitchBack}
      onNext={onOpenApp}
    />
  );
};
