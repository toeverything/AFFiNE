// import { styled } from '@/styles';
// import { useAppState } from '@/providers/app-state-provider';
// import {
//   WorkspaceItemAvatar,
//   PrivateWorkspaceWrapper,
//   WorkspaceItemContent,
// } from './styles';
// import { useRouter } from 'next/router';

// type PrivateWorkspaceItemProps = {
//   privateWorkspaceId?: string;
// };

// export const PrivateWorkspaceItem = ({
//   privateWorkspaceId,
// }: PrivateWorkspaceItemProps) => {
//   const { user } = useAppState();
//   const router = useRouter();
//   const handleClick = () => {
//     if (privateWorkspaceId) {
//       router.push(`/workspace/${privateWorkspaceId}`);
//     }
//   };
//   if (user) {
//     const Username = user.name;
//     return (
//       <PrivateWorkspaceWrapper onClick={handleClick}>
//         <WorkspaceItemAvatar alt={Username} src={user.avatar_url}>
//           {Username}
//         </WorkspaceItemAvatar>
//         <WorkspaceItemContent>
//           <Name title={Username}>{Username}</Name>
//           <Email title={user.email}>{user.email}</Email>
//         </WorkspaceItemContent>
//       </PrivateWorkspaceWrapper>
//     );
//   }
//   return null;
// };

// const Name = styled('div')(({ theme }) => {
//   return {
//     color: theme.colors.quoteColor,
//     fontSize: theme.font.base,
//     fontWeight: 500,
//     overflow: 'hidden',
//     textOverflow: 'ellipsis',
//     whiteSpace: 'nowrap',
//   };
// });

// const Email = styled('div')(({ theme }) => {
//   return {
//     color: theme.colors.iconColor,
//     fontSize: theme.font.sm,
//     overflow: 'hidden',
//     textOverflow: 'ellipsis',
//     whiteSpace: 'nowrap',
//   };
// });
export const test = () => {
  return <></>;
};
