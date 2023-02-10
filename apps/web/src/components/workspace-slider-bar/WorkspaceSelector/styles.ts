import { MuiAvatar, textEllipsis } from '@affine/component';
import { styled } from '@affine/component';
export const SelectorWrapper = styled('div')({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  ':hover': {
    cursor: 'pointer',
  },
});

export const Avatar = styled(MuiAvatar)({
  height: '28px',
  width: '28px',
});

export const WorkspaceName = styled('span')(({ theme }) => {
  return {
    marginLeft: '12px',
    fontSize: theme.font.h6,
    fontWeight: 500,
    color: theme.colors.iconColor,
    marginTop: '4px',
    flexGrow: 1,
    ...textEllipsis(1),
  };
});
