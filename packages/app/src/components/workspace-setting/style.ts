import { displayFlex, styled } from '@/styles';

export const StyledSettingContainer = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    marginTop: '24px',
    marginLeft: '48px',
    overflow: 'auto',
  };
});

export const StyledSettingSidebar = styled('div')(() => {
  {
    return {
      flexShrink: 0,
      flexGrow: 0,
    };
  }
});

export const StyledSettingContent = styled('div')(() => {
  return {};
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
      marginTop: '25px',
    };
  }
});

export const WorkspaceSettingTagItem = styled('li')<{ isActive?: boolean }>(
  ({ theme, isActive }) => {
    {
      return {
        display: 'flex',
        position: 'relative',
        margin: '0 48px 8px 0',
        height: '34px',
        color: isActive ? theme.colors.primaryColor : theme.colors.textColor,
        fontWeight: '500',
        fontSize: theme.font.base,
        lineHeight: theme.font.lineHeightBase,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        '::after': {
          content: '""',
          width: '100%',
          height: '2px',
          background: isActive ? theme.colors.primaryColor : 'transparent',
          transition: 'all 0.15s ease',
          position: 'absolute',
          left: '0',
          bottom: '0',
        },
        ':hover': { color: theme.colors.primaryColor },
      };
    }
  }
);

export const StyledSettingTagIconContainer = styled('div')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    marginRight: '14.64px',
    width: '14.47px',
    fontSize: '14.47px',
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
    marginTop: '60px',
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
