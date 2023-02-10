import { styled } from '@affine/component';
import { Input } from '@affine/component';

export const StyledInput = styled(Input)(({ theme }) => {
  return {
    border: `1px solid ${theme.colors.borderColor}`,
    borderRadius: '10px',
    fontSize: theme.font.sm,
  };
});

export const StyledProviderInfo = styled('p')(({ theme }) => {
  return {
    color: theme.colors.iconColor,
    svg: {
      verticalAlign: 'sub',
      marginRight: '10px',
    },
  };
});

export const StyledAvatar = styled('div')(
  ({ disabled }: { disabled: boolean }) => {
    return {
      position: 'relative',
      marginRight: '20px',
      cursor: disabled ? 'default' : 'pointer',
      ':hover': {
        '.camera-icon': {
          display: 'block',
        },
      },
      '.camera-icon': {
        position: 'absolute',
        display: 'none',
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        backgroundColor: 'rgba(60, 61, 63, 0.5)',
        top: 0,
        left: 0,
        textAlign: 'center',
        lineHeight: '72px',
      },
    };
  }
);
