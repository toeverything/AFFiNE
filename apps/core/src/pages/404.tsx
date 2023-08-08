import { displayFlex, styled } from '@affine/component';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import type { ReactElement } from 'react';

import { useNavigateHelper } from '../hooks/use-navigate-helper';

export const StyledContainer = styled('div')(() => {
  return {
    ...displayFlex('center', 'center'),
    flexDirection: 'column',
    height: '100vh',

    img: {
      width: '360px',
      height: '270px',
    },
    p: {
      fontSize: '22px',
      fontWeight: 600,
      margin: '24px 0',
    },
  };
});

export const NotfoundPage = () => {
  const t = useAFFiNEI18N();
  const { jumpToSubPath, jumpToIndex } = useNavigateHelper();
  return (
    <StyledContainer data-testid="notFound">
      <img alt="404" src="/imgs/invite-error.svg" width={360} height={270} />

      <p>{t['404 - Page Not Found']()}</p>
      <Button
        shape="round"
        onClick={() => {
          const id = localStorage.getItem('last_workspace_id');
          if (id) {
            jumpToSubPath(id, WorkspaceSubPath.ALL);
          } else {
            jumpToIndex();
          }
        }}
      >
        {t['Back Home']()}
      </Button>
    </StyledContainer>
  );
};

export const Component = (): ReactElement => {
  return <NotfoundPage></NotfoundPage>;
};
