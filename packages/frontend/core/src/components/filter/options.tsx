import { type MenuRef } from '@affine/component';
import { useCallback, useEffect, useRef, useState } from 'react';

type FilterOptionsGroupChildren =
  | React.ReactNode
  | ((args: {
      isDraft?: boolean;
      onDraftCompleted?: () => void;
      menuRef: React.Ref<MenuRef>;
    }) => React.ReactNode);

export const FilterOptionsGroup = ({
  isDraft,
  onDraftCompleted,
  items,
  initialStep = 0,
}: {
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  items?: FilterOptionsGroupChildren[];
  initialStep?: number;
}) => {
  const stepCount =
    items?.filter(v => {
      if (typeof v === 'function') {
        return true;
      }
      return false;
    }).length ?? 0;

  const childRefs = useRef<(MenuRef | null)[]>([]);
  const [currentStep, setCurrentStep] = useState(initialStep);

  const handleNextStep = useCallback(() => {
    // Add a small delay between steps to prevent the next menu from automatically closing due to the previous menu's close event
    setTimeout(() => {
      if (currentStep < stepCount - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        onDraftCompleted?.();
      }
    }, 50);
  }, [currentStep, stepCount, onDraftCompleted]);

  useEffect(() => {
    if (isDraft) {
      childRefs.current[currentStep]?.changeOpen(true);
    }
    return;
  }, [isDraft, currentStep]);

  let renderStep = 0;
  return items?.map(child => {
    if (typeof child === 'function') {
      const currentRenderStep = renderStep;
      renderStep++;
      const childIsDraft = isDraft
        ? currentRenderStep === currentStep
        : undefined;
      return child({
        isDraft: childIsDraft,
        onDraftCompleted: () => {
          if (childIsDraft) {
            handleNextStep();
          }
        },
        menuRef: (ref: MenuRef) => {
          childRefs.current[currentRenderStep] = ref;
          return () => {
            childRefs.current[currentRenderStep] = null;
          };
        },
      });
    }
    return child;
  });
};
