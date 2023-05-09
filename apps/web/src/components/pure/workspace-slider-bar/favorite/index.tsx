import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowDownSmallIcon, FavoriteIcon } from '@blocksuite/icons';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useCallback, useState } from 'react';

import type { AllWorkspace } from '../../../../shared';
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
  'currentPath' | 'paths' | 'currentPageId' | 'openPage'
> & {
  currentWorkspace: AllWorkspace;
}) => {
  const currentWorkspaceId = currentWorkspace.id;
  const pageMeta = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);

  const [showSubFavorite, setOpenSubFavorite] = useState(true);

  const t = useAFFiNEI18N();

  return (
    <>
      <StyledListItem
        active={
          currentPath ===
          (currentWorkspaceId && paths.favorite(currentWorkspaceId))
        }
      >
        <StyledLink
          href={{
            pathname: currentWorkspaceId && paths.favorite(currentWorkspaceId),
          }}
        >
          <FavoriteIcon />
          {t['Favorites']()}
        </StyledLink>
        <StyledCollapseButton
          onClick={useCallback(() => {
            setOpenSubFavorite(!showSubFavorite);
          }, [showSubFavorite])}
          collapse={showSubFavorite}
        >
          <ArrowDownSmallIcon />
        </StyledCollapseButton>
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
