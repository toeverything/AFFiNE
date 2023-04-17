import { IconButton } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { CloseIcon, NewIcon } from '@blocksuite/icons';
import { useCallback, useState } from 'react';

import {
  useGuideHidden,
  useGuideHiddenUntilNextUpdate,
} from '../../../../hooks/use-is-first-load';
import { StyledChangeLog, StyledChangeLogWrapper } from '../shared-styles';
import { StyledLink } from '../style';

export const ChangeLog = () => {
  const [guideHidden, setGuideHidden] = useGuideHidden();
  const [guideHiddenUntilNextUpdate, setGuideHiddenUntilNextUpdate] =
    useGuideHiddenUntilNextUpdate();
  const [isClose, setIsClose] = useState(false);
  const { t } = useTranslation();
  const onCloseWhatsNew = useCallback(() => {
    setTimeout(() => {
      setGuideHiddenUntilNextUpdate({
        ...guideHiddenUntilNextUpdate,
        changeLog: true,
      });
      setGuideHidden({ ...guideHidden, changeLog: true });
    }, 300);
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
    <StyledChangeLogWrapper isClose={isClose}>
      <StyledChangeLog data-testid="change-log" isClose={isClose}>
        <StyledLink
          href='https://github.com/toeverything/AFFiNE/releases'
          target="_blank"
        >
          <NewIcon />
          {t("Discover what's new!")}
        </StyledLink>
        <IconButton
          onClick={() => {
            setIsClose(true);
            onCloseWhatsNew();
          }}
          data-testid="change-log-close-button"
        >
          <CloseIcon />
        </IconButton>
      </StyledChangeLog>
    </StyledChangeLogWrapper>
  );
};

export default ChangeLog;
