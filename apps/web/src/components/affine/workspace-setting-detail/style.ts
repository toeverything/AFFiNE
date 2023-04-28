import { styled } from '@affine/component';
import { FlexWrapper } from '@affine/component';
export const StyledSettingContainer = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    padding: '52px 0 0 52px',
    height: 'calc(100vh - 52px)',
  };
});

export const StyledSettingSidebar = styled('div')(() => {
  {
    return {
      marginTop: '52px',
    };
  }
});

export const StyledSettingContent = styled('div')(() => {
  return {
    overflow: 'auto',
    flex: 1,
    paddingTop: '48px',
  };
});

export const WorkspaceSettingTagItem = styled('li')<{ isActive?: boolean }>(
  ({ isActive }) => {
    {
      return {
        display: 'flex',
        margin: '0 48px 0 0',
        height: '34px',
        color: isActive
          ? 'var(--affine-primary-color)'
          : 'var(--affine-text-primary-color)',
        fontWeight: '500',
        fontSize: 'var(--affine-font-h6)',
        lineHeight: 'var(--affine-line-height)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      };
    }
  }
);

export const StyledSettingKey = styled('div')(() => {
  return {
    width: '140px',
    fontSize: 'var(--affine-font-base)',
    fontWeight: 500,
    marginRight: '56px',
    flexShrink: 0,
  };
});
export const StyledRow = styled(FlexWrapper)(() => {
  return {
    marginBottom: '42px',
  };
});

export const StyledWorkspaceName = styled('span')(() => {
  return {
    fontWeight: '400',
    fontSize: 'var(--affine-font-h6)',
  };
});

export const StyledIndicator = styled('div')(() => {
  return {
    height: '2px',
    background: 'var(--affine-primary-color)',
    position: 'absolute',
    left: '0',
    bottom: '0',
    transition: 'left .3s, width .3s',
  };
});

export const StyledTabButtonWrapper = styled('div')(() => {
  return {
    display: 'flex',
    position: 'relative',
  };
});

// export const StyledDownloadCard = styled('div')<{ active?: boolean }>(
//   ({ theme, active }) => {
//     return {
//       width: '240px',
//       height: '86px',
//       border: '1px solid',
//       borderColor: active
//         ? 'var(--affine-primary-color)'
//         : 'var(--affine-border-color)',
//       borderRadius: '10px',
//       padding: '8px 12px',
//       position: 'relative',
//       ':not(:last-of-type)': {
//         marginRight: '24px',
//       },
//       svg: {
//         display: active ? 'block' : 'none',
//         ...positionAbsolute({ top: '-12px', right: '-12px' }),
//       },
//     };
//   }
// );
// export const StyledDownloadCardDes = styled('div')(({ theme }) => {
//   return {
//     fontSize: 'var(--affine-font-sm)',
//     color: 'var(--affine-icon-color)',
//   };
// });
