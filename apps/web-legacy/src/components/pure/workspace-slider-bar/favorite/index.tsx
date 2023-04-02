import { useTranslation } from '@affine/i18n';
import { ArrowDownSmallIcon, FavoriteIcon } from '@blocksuite/icons';
import { useCallback, useState } from 'react';

import { usePageMeta } from '../../../../hooks/use-page-meta';
import type { WorkSpaceSliderBarProps } from '../index';
import { StyledCollapseButton, StyledListItem } from '../shared-styles';
import { StyledLink } from '../style';
import FavoriteList from './favorite-list';
export const Favorite = ({
  currentPath,
  paths,
  currentPageId,
  openPage,
  currentWorkspace,
}: Pick<
  WorkSpaceSliderBarProps,
  'currentPath' | 'paths' | 'currentPageId' | 'openPage' | 'currentWorkspace'
>) => {
  const currentWorkspaceId = currentWorkspace?.id || null;
  const pageMeta = usePageMeta(currentWorkspace?.blockSuiteWorkspace ?? null);

  const [showSubFavorite, setOpenSubFavorite] = useState(true);

  const { t } = useTranslation();

  return (
    <>
      <StyledListItem
        active={
          currentPath ===
          (currentWorkspaceId && paths.favorite(currentWorkspaceId))
        }
      >
        <StyledCollapseButton
          onClick={useCallback(() => {
            setOpenSubFavorite(!showSubFavorite);
          }, [showSubFavorite])}
          collapse={showSubFavorite}
        >
          <ArrowDownSmallIcon />
        </StyledCollapseButton>
        <StyledLink
          href={{
            pathname: currentWorkspaceId && paths.favorite(currentWorkspaceId),
          }}
        >
          <FavoriteIcon />
          {t('Favorites')}
        </StyledLink>
      </StyledListItem>
      <FavoriteList
        currentPageId={currentPageId}
        showList={showSubFavorite}
        openPage={openPage}
        pageMeta={pageMeta}
      />
    </>
  );
};

export default Favorite;
