import type { LinkEvent } from './types.js';

export type LinkEventType =
  | 'CopiedLink'
  | 'OpenedAliasPopup'
  | 'SavedAlias'
  | 'ResetedAlias'
  | 'OpenedViewSelector'
  | 'SelectedView'
  | 'OpenedCaptionEditor'
  | 'OpenedCardStyleSelector'
  | 'SelectedCardStyle'
  | 'OpenedCardScaleSelector'
  | 'SelectedCardScale'
  | 'OpenLink'
  | 'EditLink'
  | 'ReloadLink';

export type LinkToolbarEvents = Record<LinkEventType, LinkEvent>;
