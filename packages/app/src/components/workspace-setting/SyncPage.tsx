import {
  StyledWorkspaceName,
  StyledEmail,
  // StyledDownloadCard,
  // StyledDownloadCardDes,
} from './style';
import { WorkspaceUnit } from '@affine/datacenter';
import { useTranslation, Trans } from '@affine/i18n';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { EnableWorkspaceButton } from '../enable-workspace';
import { useAppState } from '@/providers/app-state-provider';
import { FlexWrapper, Content, Wrapper } from '@affine/component';

// // FIXME: Temporary solution, since the @blocksuite/icons is broken
// const ActiveIcon = () => {
//   return (
//     <svg
//       width="24"
//       height="24"
//       viewBox="0 0 24 24"
//       fill="none"
//       xmlns="http://www.w3.org/2000/svg"
//     >
//       <path
//         fillRule="evenodd"
//         clipRule="evenodd"
//         d="M2.25 12C2.25 6.61522 6.61522 2.25 12 2.25C17.3848 2.25 21.75 6.61522 21.75 12C21.75 17.3848 17.3848 21.75 12 21.75C6.61522 21.75 2.25 17.3848 2.25 12Z"
//         fill="#6880FF"
//       />
//       <path
//         fillRule="evenodd"
//         clipRule="evenodd"
//         d="M16.5068 8.44714C16.8121 8.72703 16.8328 9.20146 16.5529 9.5068L11.0529 15.5068C10.9146 15.6576 10.7208 15.7454 10.5163 15.7498C10.3118 15.7543 10.1143 15.675 9.96967 15.5303L7.46967 13.0303C7.17678 12.7374 7.17678 12.2626 7.46967 11.9697C7.76256 11.6768 8.23744 11.6768 8.53033 11.9697L10.4764 13.9158L15.4471 8.49321C15.727 8.18787 16.2015 8.16724 16.5068 8.44714Z"
//         fill="white"
//       />
//     </svg>
//   );
// };

export const SyncPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const { t } = useTranslation();
  const { user } = useAppState();
  if (workspace.provider === 'local') {
    return (
      <>
        <FlexWrapper alignItems="center" style={{ marginBottom: '12px' }}>
          <WorkspaceUnitAvatar
            size={32}
            name={workspace.name}
            workspaceUnit={workspace}
            style={{ marginRight: '12px' }}
          />
          <StyledWorkspaceName>{workspace.name}&nbsp;</StyledWorkspaceName>
          <Content weight={500}>{t('is a Local Workspace')}</Content>
        </FlexWrapper>
        <p>{t('Local Workspace Description')}</p>
        <Wrapper marginTop="32px">
          <EnableWorkspaceButton />
        </Wrapper>
      </>
    );
  }
  return (
    <>
      <FlexWrapper alignItems="center" style={{ marginBottom: '12px' }}>
        <WorkspaceUnitAvatar
          size={32}
          name={workspace.name}
          workspaceUnit={workspace}
          style={{ marginRight: '12px' }}
        />
        <StyledWorkspaceName>{workspace.name}&nbsp;</StyledWorkspaceName>
        <Content weight={500}>{t('is a Cloud Workspace')}</Content>
      </FlexWrapper>
      <Trans i18nKey="Cloud Workspace Description">
        All data will be synchronised and saved to the AFFiNE account
        <StyledEmail>
          {{
            email: '{' + user?.email + '}.',
          }}
        </StyledEmail>
      </Trans>

      {/*<Wrapper marginBottom="12px" marginTop="32px">*/}
      {/*  <Content weight="500">{t('Data sync mode')}</Content>*/}
      {/*</Wrapper>*/}
      {/*<FlexWrapper>*/}
      {/*  <StyledDownloadCard>*/}
      {/*    <ActiveIcon />*/}
      {/*    <Wrapper>{t('Download all data')}</Wrapper>*/}
      {/*    <StyledDownloadCardDes>*/}
      {/*      {t('It takes up more space on your device.')}*/}
      {/*    </StyledDownloadCardDes>*/}
      {/*  </StyledDownloadCard>*/}

      {/*  <StyledDownloadCard active>*/}
      {/*    <ActiveIcon />*/}
      {/*    <Wrapper>{t('Download core data')}</Wrapper>*/}
      {/*    <StyledDownloadCardDes>*/}
      {/*      {t('It takes up little space on your device.')}*/}
      {/*    </StyledDownloadCardDes>*/}
      {/*  </StyledDownloadCard>*/}
      {/*</FlexWrapper>*/}
    </>
  );
};
