import { globalStyle, style } from '@vanilla-extract/css';

export const inviteModalTitle = style({
  fontWeight: '600',
  fontSize: 'var(--affine-font-h-6)',
  marginBottom: '20px',
});

export const inviteModalContent = style({
  marginBottom: '10px',
});

export const inviteModalButtonContainer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  // marginTop: 10,
});

export const inviteName = style({
  marginLeft: '4px',
  marginRight: '10px',
  color: 'var(--affine-black)',
});

export const pagination = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '6px',
  marginTop: 5,
});

export const pageItem = style({
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '20px',
  height: '20px',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-primary-color)',
  borderRadius: '4px',

  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
    '&.active': {
      color: 'var(--affine-primary-color)',
      cursor: 'default',
      pointerEvents: 'none',
    },
    '&.label': {
      color: 'var(--affine-icon-color)',
      fontSize: '16px',
    },
    '&.disabled': {
      opacity: '.4',
      cursor: 'default',
      color: 'var(--affine-disable-color)',
      pointerEvents: 'none',
    },
  },
});
globalStyle(`${pageItem} a`, {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});
