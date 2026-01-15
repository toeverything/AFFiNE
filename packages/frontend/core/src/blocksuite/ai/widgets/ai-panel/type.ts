import type { nothing, TemplateResult } from 'lit';

import type { StreamObject } from '../../components/ai-chat-messages';
import type { AIItemGroupConfig } from '../../components/ai-item/types';
import type { AIError } from '../../provider';

export interface CopyConfig {
  allowed: boolean;
  onCopy: () => boolean | Promise<boolean>;
}

export interface AIPanelAnswerConfig {
  responses: AIItemGroupConfig[];
  actions: AIItemGroupConfig[];
}

export interface AIPanelErrorConfig {
  login: () => void;
  upgrade: () => void;
  cancel: () => void;
  responses: AIItemGroupConfig[];
  error?: AIError;
}

export interface AIPanelGeneratingConfig {
  generatingIcon: TemplateResult<1>;
  height?: number;
  stages?: string[];
}

export type AIActionAnswer = {
  content: string;
  streamObjects?: StreamObject[];
};

export interface AffineAIPanelWidgetConfig {
  answerRenderer: (
    answer: string,
    state?: AffineAIPanelState
  ) => TemplateResult<1> | typeof nothing;
  generateAnswer?: (props: {
    input: string;
    update: (answer: AIActionAnswer) => void;
    finish: (type: 'success' | 'error' | 'aborted', err?: AIError) => void;
    // Used to allow users to stop actively when generating
    signal: AbortSignal;
  }) => void;

  finishStateConfig: AIPanelAnswerConfig;
  generatingStateConfig: AIPanelGeneratingConfig;
  errorStateConfig: AIPanelErrorConfig;
  hideCallback?: () => void;
  discardCallback?: () => void;
  inputCallback?: (input: string) => void;
  copy?: CopyConfig;
}

export type AffineAIPanelState =
  | 'hidden'
  | 'input'
  | 'generating'
  | 'finished'
  | 'error';
