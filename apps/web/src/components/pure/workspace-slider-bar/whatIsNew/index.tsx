import { IconButton } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { CloseIcon, DoneIcon } from '@blocksuite/icons';
import { useCallback } from 'react';

import {
  useGuideHidden,
  useGuideHiddenUntilNextUpdate,
} from '../../../../hooks/affine/use-is-first-load';
import { StyledListItem } from '../shared-styles';
import { StyledLink } from '../style';
export const WhatIsNew = () => {
  const [guideHidden, setGuideHidden] = useGuideHidden();
  const [guideHiddenUntilNextUpdate, setGuideHiddenUntilNextUpdate] =
    useGuideHiddenUntilNextUpdate();
  const { t } = useTranslation();
  const onCloseWhatsNew = useCallback(() => {
    setGuideHiddenUntilNextUpdate({
      ...guideHiddenUntilNextUpdate,
      changeLog: true,
    });
    setGuideHidden({ ...guideHidden, changeLog: true });
  }, [
    guideHidden,
    guideHiddenUntilNextUpdate,
    setGuideHidden,
    setGuideHiddenUntilNextUpdate,
  ]);
  if (guideHiddenUntilNextUpdate.changeLog) {
    return <></>;
  }
  return (
    <>
      <StyledListItem>
        <StyledLink href={'https://affine.pro'} target="_blank">
          <DoneIcon />
          {t("Discover what's new!")}
        </StyledLink>
        <IconButton
          onClick={() => {
            onCloseWhatsNew();
          }}
        >
          <CloseIcon />
        </IconButton>
      </StyledListItem>
    </>
  );
};

export default WhatIsNew;
