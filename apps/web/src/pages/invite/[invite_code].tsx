import { displayFlex, styled } from '@affine/component';
import { Button } from '@affine/component';
import { Permission } from '@affine/datacenter';
import {
  SucessfulDuotoneIcon,
  UnsucessfulDuotoneIcon,
} from '@blocksuite/icons';
import { NoSsr } from '@mui/material';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Suspense } from 'react';
import useSWR from 'swr';

import inviteError from '../../../public/imgs/invite-error.svg';
import inviteSuccess from '../../../public/imgs/invite-success.svg';
import { PageLoading } from '../../components/pure/loading';
import { QueryKey } from '../../plugins/affine/fetcher';
import { NextPageWithLayout } from '../../shared';

const InvitePage: NextPageWithLayout = () => {
  const router = useRouter();
  const { data: inviteData } = useSWR<Permission>(
    typeof router.query.invite_code === 'string'
      ? [QueryKey.acceptInvite, router.query.invite_code]
      : null
  );

  if (inviteData?.accepted) {
    return (
      <StyledContainer>
        <Image src={inviteSuccess} alt="" />
        <Button
          type="primary"
          shape="round"
          onClick={() => {
            router.replace({
              pathname: `/workspace/[workspaceId]/all`,
              query: {
                workspaceId: inviteData.workspace_id,
              },
            });
          }}
        >
          Go to Workspace
        </Button>
        <p>
          <SucessfulDuotoneIcon />
          Successfully joined
        </p>
      </StyledContainer>
    );
  }

  if (inviteData?.accepted === false) {
    return (
      <StyledContainer>
        <Image src={inviteError} alt="" />
        <Button
          shape="round"
          onClick={() => {
            router.replace(`/`);
          }}
        >
          Back to Home
        </Button>
        <p>
          <UnsucessfulDuotoneIcon />
          The link has expired
        </p>
      </StyledContainer>
    );
  }
  throw new Error('Invalid invite code');
};

export default InvitePage;

InvitePage.getLayout = page => {
  return (
    <Suspense fallback={<PageLoading />}>
      <NoSsr>{page}</NoSsr>
    </Suspense>
  );
};

const StyledContainer = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    ...displayFlex('center', 'center'),
    flexDirection: 'column',
    backgroundColor: theme.colors.pageBackground,
    img: {
      width: '300px',
      height: '300px',
    },
    p: {
      ...displayFlex('center', 'center'),
      marginTop: '24px',
      svg: {
        color: theme.colors.primaryColor,
        fontSize: '24px',
        marginRight: '12px',
      },
    },
  };
});
