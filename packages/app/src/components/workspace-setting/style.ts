import { styled } from '@/styles';
import { Button } from '@/ui/button';
import MuiAvatar from '@mui/material/Avatar';

export const StyledSettingContainer = styled('div')(({ theme }) => {
  return {
    display: 'flex',
    padding: '50px',
    flexDirection: 'column',
  };
});

export const StyledSettingSidebar = styled('div')(({ theme }) => {
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
    height: '620px',
  };
});

export const StyledSetting = styled('div')(({ theme }) => {
  {
    return {
      width: '236px',
      height: '620px',
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
      textAlign: 'center',
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

export const StyledAvatarUploadBtn = styled(Button)(({ theme }) => {
  return {
    backgroundColor: theme.colors.hoverBackground,
    color: theme.colors.primaryColor,
    margin: '0 12px 0 24px',
  };
});

export const StyledMemberTitleContainer = styled('div')(() => {
  return {
    display: 'flex',
    marginTop: '60px',
    fontWeight: '500',
    flex: 1,
  };
});

export const StyledMemberAvatar = styled(MuiAvatar)(() => {
  return { height: '40px', width: '40px' };
});

export const StyledMemberNameContainer = styled('div')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '402px',
  };
});

export const StyledMemberRoleContainer = styled('div')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '222px',
  };
});

export const StyledMemberListContainer = styled('ul')(() => {
  return {
    marginTop: '15px',
    height: '432px',
    overflowY: 'scroll',
  };
});

export const StyledMemberListItem = styled('li')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    height: '72px',
  };
});

export const StyledMemberInfo = styled('div')(() => {
  return {
    paddingLeft: '12px',
  };
});

export const StyledMemberName = styled('div')(({ theme }) => {
  return {
    fontWeight: '400',
    fontSize: '18px',
    lineHeight: '16px',
    color: theme.colors.textColor,
  };
});

export const StyledMemberEmail = styled('div')(({ theme }) => {
  return {
    fontWeight: '400',
    fontSize: '16px',
    lineHeight: '22px',
    color: theme.colors.iconColor,
  };
});

export const StyledMemberButtonContainer = styled('div')(() => {
  return {
    marginTop: '14px',
  };
});

export const StyledMoreVerticalButton = styled('button')(() => {
  return {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
  };
});

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
    height: '494px',
    display: 'flex',
    flexDirection: 'column',
  };
});
