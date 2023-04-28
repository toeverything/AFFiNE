import { IconButton, Tooltip, TreeView } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  ArrowRightSmallIcon,
  CollapseIcon,
  ExpandIcon,
  MoreHorizontalIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useRouter } from 'next/router';
import type { MouseEvent } from 'react';
import { Fragment, useCallback, useMemo, useState } from 'react';

import type { PinboardNode } from '../../../../hooks/use-pinboard-data';
import { usePinboardData } from '../../../../hooks/use-pinboard-data';
import { useRouterHelper } from '../../../../hooks/use-router-helper';
import type { BlockSuiteWorkspace } from '../../../../shared';
import { PinboardRender } from '../../../affine/pinboard';
import {
  StyledNavigationPathContainer,
  StyledNavPathExtendContainer,
  StyledNavPathLink,
} from './styles';
import { calcHowManyPathShouldBeShown, findPath } from './utils';

export const NavigationPath = ({
  blockSuiteWorkspace,
  pageId: propsPageId,
  onJumpToPage,
}: {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId?: string;
  onJumpToPage?: (pageId: string) => void;
}) => {
  const metas = useBlockSuitePageMeta(blockSuiteWorkspace);
  const router = useRouter();
  const { t } = useTranslation();

  const [openExtend, setOpenExtend] = useState(false);
  const pageId = propsPageId ?? router.query.pageId;
  const { jumpToPage } = useRouterHelper(router);
  const pathData = useMemo(() => {
    const meta = metas.find(m => m.id === pageId);
    const path = meta ? findPath(metas, meta) : [];

    const actualPath = calcHowManyPathShouldBeShown(path);
    return {
      hasEllipsis: path.length !== actualPath.length,
      path: actualPath,
    };
  }, [metas, pageId]);

  if (pathData.path.length < 2) {
    // Means there is no parent page
    return null;
  }
  return (
    <>
      <StyledNavigationPathContainer data-testid="navigation-path">
        {openExtend ? (
          <span>{t('Navigation Path')}</span>
        ) : (
          pathData.path.map((meta, index) => {
            const isLast = index === pathData.path.length - 1;
            const showEllipsis = pathData.hasEllipsis && index === 1;
            return (
              <Fragment key={meta.id}>
                {showEllipsis && (
                  <>
                    <IconButton
                      size="small"
                      onClick={() => setOpenExtend(true)}
                    >
                      <MoreHorizontalIcon />
                    </IconButton>
                    <ArrowRightSmallIcon className="path-arrow" />
                  </>
                )}
                <StyledNavPathLink
                  data-testid="navigation-path-link"
                  active={isLast}
                  onClick={() => {
                    if (isLast) return;
                    jumpToPage(blockSuiteWorkspace.id, meta.id);
                    onJumpToPage?.(meta.id);
                  }}
                  title={meta.title}
                >
                  {meta.title}
                </StyledNavPathLink>
                {!isLast && <ArrowRightSmallIcon className="path-arrow" />}
              </Fragment>
            );
          })
        )}
        <Tooltip
          content={
            openExtend ? t('Back to Quick Search') : t('View Navigation Path')
          }
          placement="top"
          disablePortal={true}
        >
          <IconButton
            data-testid="navigation-path-expand-btn"
            size="small"
            className="collapse-btn"
            onClick={() => {
              setOpenExtend(!openExtend);
            }}
          >
            {openExtend ? <CollapseIcon /> : <ExpandIcon />}
          </IconButton>
        </Tooltip>
      </StyledNavigationPathContainer>
      <NavigationPathExtendPanel
        open={openExtend}
        blockSuiteWorkspace={blockSuiteWorkspace}
        metas={metas}
        onJumpToPage={onJumpToPage}
      />
    </>
  );
};

const NavigationPathExtendPanel = ({
  open,
  metas,
  blockSuiteWorkspace,
  onJumpToPage,
}: {
  open: boolean;
  metas: PageMeta[];
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onJumpToPage?: (pageId: string) => void;
}) => {
  const router = useRouter();
  const { jumpToPage } = useRouterHelper(router);

  const handlePinboardClick = useCallback(
    (e: MouseEvent<HTMLDivElement>, node: PinboardNode) => {
      jumpToPage(blockSuiteWorkspace.id, node.id);
      onJumpToPage?.(node.id);
    },
    [blockSuiteWorkspace.id, jumpToPage, onJumpToPage]
  );

  const { data } = usePinboardData({
    metas,
    pinboardRender: PinboardRender,
    blockSuiteWorkspace: blockSuiteWorkspace,
    onClick: handlePinboardClick,
    asPath: true,
  });

  return (
    <StyledNavPathExtendContainer
      show={open}
      data-testid="navigation-path-expand-panel"
    >
      <TreeView data={data} indent={10} disableCollapse={true} />
    </StyledNavPathExtendContainer>
  );
};
