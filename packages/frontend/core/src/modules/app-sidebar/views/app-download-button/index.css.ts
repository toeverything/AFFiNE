import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export {
  closeIcon,
  ellipsisTextOverflow,
  halo,
  icon,
  particles,
  root,
} from '../app-updater-button/index.css';
export const rootPadding = style({
  padding: '0 24px',
});
export const label = style({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  fontSize: cssVar('fontSm'),
  whiteSpace: 'nowrap',
});
