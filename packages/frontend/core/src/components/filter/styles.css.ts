import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
});

export const filterItemStyle = style({
  display: 'flex',
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: '8px',
  background: cssVar('white'),
  padding: '4px 8px',
  gap: '4px',
  height: '32px',
  overflow: 'hidden',
  justifyContent: 'space-between',
  userSelect: 'none',
  alignItems: 'center',
  selectors: {
    '&[data-draft="true"]': {
      borderStyle: 'dashed',
    },
  },
});

export const filterItemCloseStyle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  marginLeft: '4px',
});

export const selectHeaderContainer = style({
  display: 'flex',
  flexDirection: 'row',
  margin: '2px 2px',
  alignItems: 'center',
  gap: '4px',
});

export const variableSelectTitleStyle = style({
  fontWeight: 500,
  lineHeight: '22px',
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  selectors: {
    '&:first-child': {
      marginLeft: '12px',
    },
  },
});

export const filterTypeItemIcon = style({
  fontSize: '20px',
  color: cssVar('iconColor'),
});

export const filterTypeItemName = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
});

export const addFilterMenuContent = style({
  width: '230px',
});

export const addFilterButton = style({
  height: '32px',
});
