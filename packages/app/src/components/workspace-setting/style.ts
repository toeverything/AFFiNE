import { styled } from '@affine/component';
import { FlexWrapper } from '@affine/component';
export const StyledSettingContainer = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',

    padding: '0 34px 20px 48px',
    height: '100vh',
  };
});

export const StyledSettingSidebar = styled('div')(() => {
  {
    return {
      marginTop: '48px',
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

export const StyledSettingTabContainer = styled('ul')(() => {
  {
    return {
      display: 'flex',
    };
  }
});

export const WorkspaceSettingTagItem = styled('li')<{ isActive?: boolean }>(
  ({ theme, isActive }) => {
    {
      return {
        display: 'flex',
        margin: '0 48px 0 0',
        height: '34px',
        color: isActive ? theme.colors.primaryColor : theme.colors.textColor,
        fontWeight: '500',
        fontSize: theme.font.h6,
        lineHeight: theme.font.lineHeight,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        borderBottom: `2px solid ${
          isActive ? theme.colors.primaryColor : 'none'
        }`,
        ':hover': { color: theme.colors.primaryColor },
      };
    }
  }
);

export const StyledSettingKey = styled.div(({ theme }) => {
  return {
    width: '140px',
    textAlign: 'right',
    fontSize: theme.font.base,
    fontWeight: 500,
    marginRight: '56px',
    flexShrink: 0,
  };
});
export const StyledRow = styled(FlexWrapper)(() => {
  return {
    marginBottom: '32px',
  };
});

export const StyledWorkspaceName = styled('span')(({ theme }) => {
  return {
    fontWeight: '400',
    fontSize: theme.font.h6,
  };
});

export const StyledEmail = styled('span')(() => {
  return {
    color: '#E8178A',
  };
});

// export const StyledDownloadCard = styled.div<{ active?: boolean }>(
//   ({ theme, active }) => {
//     return {
//       width: '240px',
//       height: '86px',
//       border: '1px solid',
//       borderColor: active
//         ? theme.colors.primaryColor
//         : theme.colors.borderColor,
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
// export const StyledDownloadCardDes = styled.div(({ theme }) => {
//   return {
//     fontSize: theme.font.sm,
//     color: theme.colors.iconColor,
//   };
// });
