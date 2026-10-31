import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from '@emotion/css';

export const titleCellStyle = css({
  width: '100%',
  display: 'flex',
  // Closes the DEAD ZONE between a leading decoration and the title text.
  //
  // Measured on a real List view row: drag handle 476-488, checkbox 488-504,
  // rich-text 512-1164. The 8px at 504-512 is the checkbox's own trailing gap
  // and belonged to NOTHING selectable -- a press there could not resolve to a
  // caret in the title. That 8px band is exactly where the reported bug lived:
  // a click-drag begun at 506 or 510 anchored its selection outside the title's
  // inline root, which makes the browser emit no `beforeinput` at all and kills
  // Backspace, Delete and typing alike. (See the comment on
  // `titleTaskCheckboxStyle` below for the full mechanism.)
  //
  // Marking the decorations `user-select: none` stops them anchoring a broken
  // selection, but on its own it only converts the dead zone from "selects
  // something unusable" into "selects nothing" -- the user still cannot begin a
  // selection at the first character without hitting the text within ~1px.
  // Handing the gap to the rich-text makes a press there resolve to index 0 of
  // the title, which is what every other editor does and what the user was
  // trying to do.
  //
  // Negative margin plus equal padding, so the hit area grows leftwards while
  // the text keeps rendering in exactly the same place -- no visual change.
  // Scoped to `[data-title-leading] + rich-text` so it applies only when a
  // decoration actually precedes the text; title cells without one (table and
  // kanban views) are untouched.
  //
  // The margin and the padding must go on DIFFERENT elements, and both of the
  // two obvious one-element versions were measured and rejected:
  //
  //  * both on `rich-text`: its box moves left, but `.inline-editor` is
  //    `width: 100%` of `rich-text`'s CONTENT box, so the inline root stays
  //    exactly where it was and the gap is still outside it. Drag in the gap ->
  //    still no selection.
  //  * both on the inline root: its box does move left, but `rich-text` is
  //    `overflow-x: auto`, and an overflow container clips overflowing content
  //    out of HIT-TESTING. Measured with `elementFromPoint` across the gap: the
  //    topmost element at x=505..511 was still the cell, never the editor, even
  //    though the inline root's rect started at 504.
  //
  // So: pull `rich-text` left over the gap (nothing overflows, nothing is
  // clipped), then put the gap back as padding INSIDE the inline root, where it
  // is both hit-testable and part of the editable host.
  '& [data-title-leading] + rich-text': {
    marginLeft: '-8px',
  },
  '& [data-title-leading] + rich-text [data-v-root]': {
    paddingLeft: '8px',
  },
});

export const titleRichTextStyle = css({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  outline: 'none',
  wordBreak: 'break-all',
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
});

export const headerAreaIconStyle = css({
  // Chrome, not content. See `titleTaskCheckboxStyle` below for why anything
  // rendered before the title's inline root must not be selectable.
  userSelect: 'none',
  height: 'max-content',
  display: 'flex',
  alignItems: 'center',
  marginRight: '8px',
  padding: '2px',
  borderRadius: '4px',
  marginTop: '2px',
  color: cssVarV2.icon.primary,
  backgroundColor: 'var(--affine-background-secondary-color)',
});

export const titleTaskCheckboxStyle = css({
  // `relative` — required so `playCheckAnimation`'s absolutely-positioned
  // spark-burst element (appended as a child of this checkbox on check) is
  // positioned relative to the checkbox itself. Without this, the spark
  // has no positioned ancestor to anchor to here and falls back to
  // whichever ancestor further up the tree happens to be positioned (or
  // the viewport), rendering nowhere near the actual checkbox. Mirrors
  // `affine:list`'s own todo checkbox, which already has this via its
  // parent `.affine-list-block__prefix` class.
  position: 'relative',
  // Load-bearing, not cosmetic. This checkbox is `contenteditable="false"`
  // chrome rendered IMMEDIATELY BEFORE the title's `<rich-text>`, i.e. left of
  // character 0. While it was selectable, a DOM selection could be anchored
  // inside it with its focus inside the inline root -- a range that straddles
  // the editable boundary, for which the browser emits NO `beforeinput` event at
  // all. Since `beforeinput` is the only channel the inline editor applies edits
  // from, Backspace, Delete AND typing a replacement all silently did nothing.
  // Verified by building exactly that range by hand: the event log is `[keydown]`
  // and nothing else, with `isReadonly: false` and the cell still in editing
  // mode, while the same range anchored on the title's own text node logs
  // `[keydown -> beforeinput -> delete applied]`.
  // See the matching comment on `.affine-data-view-list-drag-handle`
  // (data-view/src/view-presets/list/pc/renderer.ts), which is the decoration a
  // real user drag actually landed on.
  // Regression test: tests/affine-local/e2e/row-index0-anchor-origin.spec.ts
  userSelect: 'none',
  height: 'max-content',
  display: 'flex',
  alignItems: 'center',
  marginRight: '8px',
  marginTop: '2px',
  color: cssVarV2.icon.primary,
  cursor: 'pointer',
  // 999.3: on iOS, an element without `touch-action: manipulation` gets the
  // double-tap-to-zoom wait -- the click arrives ~450-570ms after the touch,
  // and a second tap inside that window turns both into a "double tap" with
  // NO click at all. Users re-tap because nothing happened, so ticking took
  // 4-16 taps on device (recorded: most on-target touches never produced a
  // click).
  touchAction: 'manipulation',
  // 999.3: the icon is 15x15px -- far below a usable touch target. Extend
  // it to ~27x27 (6px: stays inside its own 28px row and the 8px gap
  // before the title text) invisibly without moving layout (this element is
  // `position: relative`, see above). Top-level key: this is Emotion, not
  // vanilla-extract -- a `selectors: {}` wrapper is NOT special here.
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: '-6px',
  },
  selectors: {
    '&.readonly': {
      cursor: 'default',
      opacity: 0.5,
    },
  },
});
