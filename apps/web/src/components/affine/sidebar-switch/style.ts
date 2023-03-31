import { IconButton, styled } from '@affine/component';

export const StyledSidebarSwitch = styled(IconButton, {
  shouldForwardProp(propName: PropertyKey) {
    return propName !== 'visible';
  },
})<{ visible: boolean }>(({ visible }) => {
  const macDesktop =
    environment.isDesktop && 'isMacOs' in environment && environment.isMacOs;
  return {
    opacity: visible ? 1 : 0,
    transition: 'all 0.2s ease-in-out',
    left: macDesktop ? '48px' : '',
  };
});
