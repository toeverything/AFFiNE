import { styled } from '@/styles';

export const StyledSettingContent = styled('div')(({ theme }) => {
  return {
    position: 'relative',
    display: 'flex',
    padding: '0px',
    width: '1080px',
    background: theme.colors.popoverBackground,
    borderRadius: '12px',
  };
});

export const StyledSettingSidebar = styled('div')(({ theme }) => {
  {
    return {
      width: '236px',
      height: '780px',
      background: theme.mode === 'dark' ? '#272727' : '#FBFBFC',
    };
  }
});

export const StyledSettingSidebarHeader = styled('div')(({ theme }) => {
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

export const StyledSettingTabContainer = styled('ul')(({ theme }) => {
  {
    return {
      display: 'flex',
      flexDirection: 'column',
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

export const StyledSettingTagIconContainer = styled('div')(({ theme }) => {
  return {
    display: 'flex',
    alignItems: 'center',
    marginRight: '14.64px',
    width: '14.47px',
    fontSize: '14.47px',
  };
});

export const StyledSettingH2 = styled('h2')(({ theme }) => {
  return {
    fontWeight: '500',
    fontSize: '18px',
    lineHeight: '26px',
  };
});
