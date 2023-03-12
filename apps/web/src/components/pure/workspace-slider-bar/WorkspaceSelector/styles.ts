import { MuiAvatar, textEllipsis } from '@affine/component';
import { styled } from '@affine/component';
export const SelectorWrapper = styled('div')(({ theme }) => {
  return {
    marginTop: '4px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 44px 0 12px',
    borderRadius: '5px',
    color: theme.colors.textColor,
    position: 'relative',
    ':hover': {
      cursor: 'pointer',
      background: theme.colors.hoverBackground,
    },
  };
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
    flexGrow: 1,
    ...textEllipsis(1),
  };
});
