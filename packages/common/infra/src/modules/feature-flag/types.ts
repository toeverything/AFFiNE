type FeedbackType = 'discord' | 'email' | 'github';

export type FlagInfo = {
  displayName: string;
  description?: string;
  configurable?: boolean;
  defaultState?: boolean; // default to open and not controlled by user
  feedbackType?: FeedbackType;
  feedbackLink?: string;
} & (
  | {
      category: 'affine';
    }
  | {
      category: 'blocksuite';
      bsFlag: keyof BlockSuiteFlags;
    }
);
