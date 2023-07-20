import { globalStyle, style } from '@vanilla-extract/css';

export const button = style({
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  userSelect: 'none',
  touchAction: 'manipulation',
  outline: '0',
  border: '1px solid',
  padding: '0 18px',
  borderRadius: '8px',
  fontSize: 'var(--affine-font-base)',
  transition: 'all .3s',
  ['WebkitAppRegion' as string]: 'no-drag',
  // changeable
  height: '28px',
  backgroundColor: 'var(--affine-white)',
  borderColor: 'var(--affine-border-color)',
  color: 'var(--affine-text-primary-color)',

  selectors: {
    '&:hover': {
      backgroundColor: 'var(--affine-hover-color)',
    },
    '&.disabled': {
      opacity: '.4',
      cursor: 'default',
      color: 'var(--affine-disable-color)',
      pointerEvents: 'none',
    },
    '&.disabled:hover': {
      backgroundColor: 'inherit',
    },

    '&.block': { display: 'flex', width: '100%' },

    '&.circle': {
      borderRadius: '50%',
    },
    '&.round': {
      borderRadius: '14px',
    },
    // size
    '&.large': {
      height: '32px',
    },
    '&.round.large': {
      borderRadius: '16px',
    },
    '&.extraLarge': {
      fontWeight: 600,
      height: '40px',
    },
    '&.round.extraLarge': {
      borderRadius: '20px',
    },
    // type
    '&.plain': {
      color: 'var(--affine-text-primary-color)',
      borderColor: 'transparent',
    },

    '&.primary': {
      color: 'var(--affine-white)',
      backgroundColor: 'var(--affine-primary-color)',
      borderColor: 'var(--affine-black-10)',
    },
    '&.primary:hover': {
      backgroundColor:
        'linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), var(--affine-primary-color)',
    },
    '&.primary.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.primary.disabled:hover': {
      backgroundColor: 'var(--affine-primary-color)',
    },

    '&.error': {
      color: 'var(--affine-white)',
      backgroundColor: 'var(--affine-error-color)',
      borderColor: 'var(--affine-black-10)',
    },
    '&.error:hover': {
      backgroundColor:
        'linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), var(--affine-error-color)',
    },
    '&.error.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.error.disabled:hover': {
      backgroundColor: 'var(--affine-error-color)',
    },

    '&.warning': {
      color: 'var(--affine-white)',
      backgroundColor: 'var(--affine-warning-color)',
      borderColor: 'var(--affine-black-10)',
    },
    '&.warning:hover': {
      backgroundColor:
        'linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), var(--affine-warning-color)',
    },
    '&.warning.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.warning.disabled:hover': {
      backgroundColor: 'var(--affine-warning-color)',
    },

    '&.success': {
      color: 'var(--affine-white)',
      backgroundColor: 'var(--affine-success-color)',
      borderColor: 'var(--affine-black-10)',
    },
    '&.success:hover': {
      backgroundColor:
        'linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), var(--affine-success-color)',
    },
    '&.success.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.success.disabled:hover': {
      backgroundColor: 'var(--affine-success-color)',
    },

    '&.processing': {
      color: 'var(--affine-white)',
      backgroundColor: 'var(--affine-processing-color)',
      borderColor: 'var(--affine-black-10)',
    },
    '&.processing:hover': {
      backgroundColor:
        'linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), var(--affine-processing-color)',
    },
    '&.processing.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.processing.disabled:hover': {
      backgroundColor: 'var(--affine-processing-color)',
    },
  },
});

globalStyle(`${button} > span`, {
  // flex: 1,
  lineHeight: 1,
  padding: '0 4px',
});

export const buttonIcon = style({
  flexShrink: 0,
  display: 'inline-flex',
  color: 'var(--affine-icon-color)',
  fontSize: '16px',
  width: '16px',
  height: '16px',
  selectors: {
    '&.start': {
      marginRight: '4px',
    },
    '&.end': {
      marginLeft: '4px',
    },
    '&.large': {
      fontSize: '20px',
      width: '20px',
      height: '20px',
    },
    '&.extraLarge': {
      fontSize: '20px',
      width: '20px',
      height: '20px',
    },
    '&.color-white': {
      color: 'var(--affine-white)',
    },
  },
});
