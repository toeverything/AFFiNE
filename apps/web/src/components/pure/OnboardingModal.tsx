import { TourModal } from '@affine/component/tour-modal';
import { getEnvironment } from '@affine/env';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { openOnboardingModalAtom } from '../../atoms';
import {
  useGuideHidden,
  useGuideHiddenUntilNextUpdate,
} from '../../hooks/use-is-first-load';

type OnboardingModalProps = {
  onClose: () => void;
  open: boolean;
};
export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  open,
  onClose,
}) => {
  const env = getEnvironment();
  const setOpenOnboardingModal = useSetAtom(openOnboardingModalAtom);
  const [guideHidden, setGuideHidden] = useGuideHidden();
  const [guideHiddenUntilNextUpdate, setGuideHiddenUntilNextUpdate] =
    useGuideHiddenUntilNextUpdate();
  const onCloseTourModal = useCallback(() => {
    onClose();
    setGuideHiddenUntilNextUpdate({
      ...guideHiddenUntilNextUpdate,
      TourModal: true,
    });
    setGuideHidden({ ...guideHidden, TourModal: true });
  }, [
    guideHidden,
    guideHiddenUntilNextUpdate,
    onClose,
    setGuideHidden,
    setGuideHiddenUntilNextUpdate,
  ]);
  if (window !== undefined) {
    if (guideHidden.tourModal === false && env.isDesktop) {
      setOpenOnboardingModal(true);
    }
  }
  if (guideHidden.TourModal || !env.isDesktop) {
    return <></>;
  }
  return <TourModal open={open} onClose={onCloseTourModal} />;
};

export default OnboardingModal;
