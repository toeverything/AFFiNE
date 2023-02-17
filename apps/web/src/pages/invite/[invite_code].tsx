import { displayFlex, styled } from '@affine/component';
import { Button } from '@affine/component';
import { Permission } from '@affine/datacenter';
import {
  SucessfulDuotoneIcon,
  UnsucessfulDuotoneIcon,
} from '@blocksuite/icons';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { PageLoading } from '@/components/loading';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { useGlobalState } from '@/store/app';

import inviteError from '../../../public/imgs/invite-error.svg';
import inviteSuccess from '../../../public/imgs/invite-success.svg';

export default function DevPage() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [inviteData, setInviteData] = useState<Permission | null>(null);
  const { acceptInvite } = useWorkspaceHelper();
  const dataCenter = useGlobalState(store => store.dataCenter);

  useEffect(() => {
    const init = async () => {
      const data = await dataCenter.acceptInvitation(
        router.query.invite_code as string
      );

      setInviteData(data as Permission);
      setLoading(false);
    };
    init();
  }, [router, acceptInvite, dataCenter]);

  if (loading) {
    return <PageLoading />;
  }

  if (inviteData?.accepted) {
    return (
      <StyledContainer>
        <Image src={inviteSuccess} alt="" />
        <Button
          type="primary"
          shape="round"
          onClick={() => {
            router.push(`/workspace/${inviteData?.workspace_id}/all`);
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
            router.push(`/`);
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
}

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
