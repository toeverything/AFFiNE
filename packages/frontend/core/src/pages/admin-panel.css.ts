import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const root = style({
  height: '100vh',
  width: '100vw',
  display: 'flex',
  flexDirection: 'column',
  fontSize: cssVar('fontBase'),
  position: 'relative',
});

export const container = style({
  display: 'flex',
  width: '100%',
  height: '100%',
});

export const sideBar = style({
  width: '300px',
  display: 'flex',
  flexDirection: 'column',
  borderRight: `1px solid ${cssVar('borderColor')}`,
  padding: '12px 8px',
  height: '100%',
  background: cssVar('backgroundPrimaryColor'),
  zIndex: 3,
});

export const scrollArea = style({
  padding: '24px 0 160px',
  background: cssVar('backgroundPrimaryColor'),
});

export const main = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  overflow: 'auto',
  alignItems: 'center',
});

export const moduleContainer = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: '16px',
  maxWidth: '960px',
  margin: 'auto',
  gap: 16,
});

export const module = style({
  fontSize: cssVar('fontH5'),
  fontWeight: 'bold',
  marginBottom: 8,
  textTransform: 'capitalize',
  padding: '16px 0',
  borderBottom: `0.5px solid ${cssVar('borderColor')}`,
});
