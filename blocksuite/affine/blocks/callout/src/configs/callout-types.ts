/**
 * Callout type configuration for Obsidian-style callouts.
 *
 * Per contracts/inline-extensions.md §5.
 *
 * 12 canonical type groups covering all aliases in CalloutType union.
 * Case-insensitive alias matching: toLowerCase() before lookup.
 *
 * `backgroundColorName` values must match keys in `cssVarV2.block.callout.background`
 * (blue | green | grey | magenta | orange | purple | red | teal | yellow).
 */

export interface CalloutTypeConfig {
  /** All type identifiers (lowercase) that map to this config. */
  aliases: string[];
  /** Unicode emoji displayed in the callout header. */
  icon: string;
  /**
   * Named background colour token — must be a key in
   * `cssVarV2.block.callout.background` (e.g. 'blue', 'grey', 'red').
   */
  backgroundColorName: string;
  /** Human-readable label for accessibility (aria-label on icon). */
  label: string;
  /** Canonical type identifier (first alias). */
  type: string;
}

export const CALLOUT_TYPE_CONFIGS: CalloutTypeConfig[] = [
  {
    type: 'note',
    aliases: ['note'],
    icon: '📝',
    backgroundColorName: 'grey',
    label: 'Note',
  },
  {
    type: 'info',
    aliases: ['info'],
    icon: 'ℹ️',
    backgroundColorName: 'blue',
    label: 'Info',
  },
  {
    type: 'abstract',
    aliases: ['abstract', 'summary', 'tldr'],
    icon: '📋',
    backgroundColorName: 'teal',
    label: 'Abstract',
  },
  {
    type: 'tip',
    aliases: ['tip', 'hint', 'important'],
    icon: '💡',
    backgroundColorName: 'teal',
    label: 'Tip',
  },
  {
    type: 'success',
    aliases: ['success', 'check', 'done'],
    icon: '✅',
    backgroundColorName: 'green',
    label: 'Success',
  },
  {
    type: 'question',
    aliases: ['question', 'help', 'faq'],
    icon: '❓',
    backgroundColorName: 'purple',
    label: 'Question',
  },
  {
    type: 'warning',
    aliases: ['warning', 'caution', 'attention'],
    icon: '⚠️',
    backgroundColorName: 'yellow',
    label: 'Warning',
  },
  {
    type: 'failure',
    aliases: ['failure', 'fail', 'missing'],
    icon: '❌',
    backgroundColorName: 'red',
    label: 'Failure',
  },
  {
    type: 'danger',
    aliases: ['danger', 'error'],
    icon: '⛔',
    backgroundColorName: 'red',
    label: 'Danger',
  },
  {
    type: 'bug',
    aliases: ['bug'],
    icon: '🐛',
    backgroundColorName: 'red',
    label: 'Bug',
  },
  {
    type: 'example',
    aliases: ['example'],
    icon: '📌',
    backgroundColorName: 'purple',
    label: 'Example',
  },
  {
    type: 'quote',
    aliases: ['quote', 'cite'],
    icon: '💬',
    backgroundColorName: 'grey',
    label: 'Quote',
  },
];

/**
 * Flat alias → config map for O(1) lookup.
 * Keys are lowercase alias strings.
 */
const ALIAS_MAP = new Map<string, CalloutTypeConfig>(
  CALLOUT_TYPE_CONFIGS.flatMap(config =>
    config.aliases.map(alias => [alias.toLowerCase(), config])
  )
);

/**
 * Returns the `CalloutTypeConfig` for a given type string (case-insensitive).
 *
 * Falls back to 'note' config for unknown / undefined types per the
 * Obsidian spec (contracts §5 rule 5).
 */
export function getCalloutTypeConfig(
  calloutType: string | null | undefined
): CalloutTypeConfig {
  if (!calloutType) {
    return ALIAS_MAP.get('note')!;
  }
  return ALIAS_MAP.get(calloutType.toLowerCase()) ?? ALIAS_MAP.get('note')!;
}

/**
 * Normalises a raw type string from `[!TYPE]` syntax to a canonical alias.
 * Returns the canonical type key or `'note'` for unrecognised types.
 */
export function normaliseCalloutType(raw: string): string {
  const config = ALIAS_MAP.get(raw.toLowerCase());
  return config?.type ?? 'note';
}
