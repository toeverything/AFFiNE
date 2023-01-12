import { styled } from '@/styles';

export const StyledSettingContainer = styled('div')(() => {
  return {
    display: 'flex',
    padding: '50px',
    flexDirection: 'column',
    height: '100vh',
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
  return {
    paddingLeft: '48px',
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
      marginTop: '25px',
    };
  }
});

export const WorkspaceSettingTagItem = styled('li')<{ isActive?: boolean }>(
  ({ theme, isActive }) => {
    {
      return {
        display: 'flex',
        marginBottom: '12px',
        padding: '0 24px',
        height: '32px',
        color: isActive ? theme.colors.primaryColor : theme.colors.textColor,
        fontWeight: '400',
        fontSize: '16px',
        lineHeight: '32px',
        cursor: 'pointer',
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
  ({ marginTop }) => {
    return {
      fontWeight: '500',
      fontSize: '18px',
      lineHeight: '26px',
      marginTop: marginTop ? `${marginTop}px` : '0px',
    };
  }
);

export const StyledPublishExplanation = styled('div')(() => {
  return {
    paddingRight: '48px',
    fontWeight: '500',
    fontSize: '18px',
    lineHeight: '26px',
    flex: 1,
    marginTop: '60px',
  };
});

export const StyledPublishCopyContainer = styled('div')(() => {
  return {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: '20px',
    paddingTop: '20px',
  };
});

export const StyledCopyButtonContainer = styled('div')(() => {
  return {
    marginLeft: '12px',
  };
});

export const StyledPublishContent = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
  };
});
