import type { BlockSuiteFlags } from '@blocksuite/affine/shared/services';

type FeedbackType = 'discord' | 'email' | 'github';

export type FlagInfo = {
  displayName: string;
  description?: string;
  configurable?: boolean;
  defaultState?: boolean; // default to open and not controlled by user
  /**
   * hide in the feature flag settings, but still can be controlled by the code
   */
  hide?: boolean;
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
