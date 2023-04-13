import { displayFlex, styled, TextButton } from '@affine/component';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { useRouterHelper } from '../../../../hooks/use-router-helper';
export const EditPage = () => {
  const router = useRouter();
  const pageId = router.query.pageId as string;
  const workspaceId = router.query.workspaceId as string;
  const { jumpToPage } = useRouterHelper(router);
  const onClickPage = useCallback(() => {
    if (workspaceId && pageId) {
      jumpToPage(workspaceId, pageId);
    }
  }, [jumpToPage, pageId, workspaceId]);
  return (
    <StyledEditPageButton onClick={() => onClickPage()}>
      Edit Page
    </StyledEditPageButton>
  );
};
export default EditPage;

const StyledEditPageButton = styled(
  TextButton,
  {}
)(({ theme }) => {
  return {
    padding: '4px 8px',
    marginLeft: '4px',
    marginRight: '16px',
    border: `1px solid ${theme.colors.primaryColor}`,
    color: theme.colors.primaryColor,
    borderRadius: '8px',
    span: {
      ...displayFlex('center', 'center'),
    },
  };
});
