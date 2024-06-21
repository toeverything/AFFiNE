import { globalStyle, style } from '@vanilla-extract/css';
export const block = style({});
globalStyle(`${block} h1`, {
  fontSize: '40px',
  fontWeight: '600',
  lineHeight: '48px',
});
globalStyle(`${block} h2`, {
  fontSize: '20px',
  fontWeight: '600',
  lineHeight: '28px',
});
globalStyle(`${block} h3`, {
  fontSize: '18px',
  fontWeight: '600',
  lineHeight: '26px',
});
globalStyle(`${block} p`, {
  fontSize: '15px',
  fontWeight: 400,
  lineHeight: '23px',
});
globalStyle(`${block} b`, {
  // TODO(@catsjuice): 500's effect not matching the design, use 600 for now
  fontWeight: '600',
});
globalStyle(`${block} ol`, {
  counterReset: 'section',
  listStyleType: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});
globalStyle(`${block} ol li, ${block} ul li`, {
  fontSize: '15px',
  fontWeight: 400,
  lineHeight: '23px',
});
globalStyle(`${block} ol li::before`, {
  display: 'inline-block',
  counterIncrement: 'section',
  content: 'counter(section) "."',
  color: '#1C81D9',
  width: '24px',
  marginRight: '4px',
});
globalStyle(`${block} ul`, {
  listStyleType: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});
globalStyle(`${block} ul li`, {
  position: 'relative',
  paddingLeft: '24px',
});
globalStyle(`${block} ul li::before`, {
  vars: {
    '--dot-svg': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Ccircle cx='2' cy='2' r='2' fill='%231C81D9'/%3E%3C/svg%3E")`,
  },
  content: '""',
  position: 'absolute',
  left: 0,
  top: 0,
  width: '24px',
  height: '24px',
  display: 'inline-block',
  backgroundImage: 'var(--dot-svg)',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: '4px 50%',
});
globalStyle(`${block} img.illustration`, {
  borderRadius: '5px',
  overflow: 'hidden',
});
export const link = style({
  color: '#1E67AF',
});
export const pageLink = style({
  color: '#424149',
  fontWeight: '500',
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '5px',
});
export const pageLinkIcon = style({
  color: '#77757D',
  alignSelf: 'center',
});
export const pageLinkLabel = style({
  position: 'relative',
  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      bottom: '-1px',
      left: 0,
      height: '1px',
      transform: 'scaleY(0.5)',
      width: '100%',
      backgroundColor: '#E3E2E4',
    },
  },
});
export const quote = style({
  paddingLeft: '17px',
  position: 'relative',
  selectors: {
    '&::before': {
      position: 'absolute',
      content: '""',
      top: 0,
      left: 0,
      height: '100%',
      width: '2px',
      borderRadius: '1px',
      backgroundColor: '#D9D9D9',
    },
  },
});
export const hr = style({
  height: '1px',
  backgroundColor: '#E3E2E4',
  border: 'none',
  margin: '18px 0',
  width: 'calc(100% - 20px)',
  alignSelf: 'center',
});
