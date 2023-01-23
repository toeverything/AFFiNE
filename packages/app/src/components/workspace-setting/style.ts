import { displayFlex, styled } from '@/styles';

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
      // height: '48px',
      marginTop: '50px',
    };
  }
});

export const StyledSettingContent = styled('div')(() => {
  return {
    overflow: 'hidden',
    flex: 1,
    paddingTop: '48px',
  };
});

export const StyledSetting = styled('div')(({ theme }) => {
  {
    return {
      width: '236px',
      background: theme.mode === 'dark' ? '#272727' : '#FBFBFC',
    };
  }
});

export const StyledSettingSidebarHeader = styled('div')(() => {
  {
    return {
      fontWeight: '500',
      fontSize: '18px',
      lineHeight: '26px',
      textAlign: 'left',
      marginTop: '37px',
    };
  }
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
        fontSize: theme.font.base,
        lineHeight: theme.font.lineHeightBase,
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

export const StyledSettingTagIconContainer = styled('div')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
  };
});

export const StyledSettingH2 = styled('h2')<{ marginTop?: number }>(
  ({ marginTop, theme }) => {
    return {
      fontWeight: '500',
      fontSize: theme.font.base,
      lineHeight: theme.font.lineHeightBase,
      marginTop: marginTop ? `${marginTop}px` : '0px',
    };
  }
);

export const StyledPublishExplanation = styled('div')(() => {
  return {
    ...displayFlex('row', 'center', 'center'),
    paddingRight: '48px',
    fontWeight: '500',
    fontSize: '18px',
    lineHeight: '26px',
    flex: 1,

    marginBottom: '22px',
  };
});
export const StyledWorkspaceName = styled('div')(() => {
  return {
    fontWeight: '400',
    fontSize: '18px',
    lineHeight: '26px',
  };
});
export const StyledWorkspaceType = styled('div')(() => {
  return {
    fontWeight: '500',
    fontSize: '18px',
    lineHeight: '26px',
  };
});

export const StyledPublishCopyContainer = styled('div')(() => {
  return {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'start',
    justifyContent: 'center',
    marginBottom: '20px',
    paddingTop: '20px',
  };
});
export const StyledStopPublishContainer = styled('div')(() => {
  return {
    position: 'absolute',
    bottom: '0',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: '20px',
  };
});

export const StyledCopyButtonContainer = styled('div')(() => {
  return {
    marginTop: '64px',
  };
});

export const StyledPublishContent = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
  };
});
