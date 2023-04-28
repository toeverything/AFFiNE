import { TourModal } from '@affine/component/tour-modal';
import { getEnvironment } from '@affine/env';
import { useCallback } from 'react';

import {
  useGuideHidden,
  useGuideHiddenUntilNextUpdate,
} from '../../hooks/use-is-first-load';

export const OnboardingModal = () => {
  const env = getEnvironment();
  const [guideHidden, setGuideHidden] = useGuideHidden();
  const [guideHiddenUntilNextUpdate, setGuideHiddenUntilNextUpdate] =
    useGuideHiddenUntilNextUpdate();
  const onCloseTourModal = useCallback(() => {
    setGuideHiddenUntilNextUpdate({
      ...guideHiddenUntilNextUpdate,
      TourModal: true,
    });
    setGuideHidden({ ...guideHidden, TourModal: true });
  }, [
    guideHidden,
    guideHiddenUntilNextUpdate,
    setGuideHidden,
    setGuideHiddenUntilNextUpdate,
  ]);
  //   if (guideHiddenUntilNextUpdate.TourModal || !env.isDesktop) {
  //     return <></>;
  //   }
  return <TourModal open={guideHidden.TourModal} onClose={onCloseTourModal} />;
};

export default OnboardingModal;
