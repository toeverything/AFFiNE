export type CompactEmoji = {
  label: string;
  annotation?: string;
  group: number;
  hexcode: string;
  order: number;
  shortcodes: string[];
  tags: string[];
  unicode: string;
  skins?: Array<Omit<CompactEmoji, 'skins'>>;
};

export type EmojiGroup = {
  name: string;
  emojis: Array<CompactEmoji>;
};
