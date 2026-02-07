import { css } from '@emotion/css';

export const chartContainerStyle = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  maxWidth: '800px', // Reduced from 960px to leave more space for View Settings
  padding: '24px',
  paddingRight: '48px', // Extra padding on right for View Settings panel space
  boxSizing: 'border-box',
  margin: '0 auto',
});
