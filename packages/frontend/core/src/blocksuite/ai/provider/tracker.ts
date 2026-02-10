import { track, tracker } from '@affine/track';
import type { EditorHost } from '@blocksuite/affine/std';
import type { GfxPrimitiveElementModel } from '@blocksuite/affine/std/gfx';
import type { BlockModel } from '@blocksuite/affine/store';
import { lowerCase, omit } from 'lodash-es';
import type { Subject } from 'rxjs';

import { AIProvider } from './ai-provider';

type ElementModel = GfxPrimitiveElementModel;

type AIActionEventName =
  | 'AI action invoked'
  | 'AI action aborted'
  | 'AI result discarded'
  | 'AI result accepted';

type AIActionEventProperties = {
  page: 'doc' | 'edgeless' | 'unknown';
  segment:
    | 'AI action panel'
    | 'right side bar'
    | 'inline chat panel'
    | 'AI result panel'
    | 'AI chat block';
  module:
    | 'exit confirmation'
    | 'AI action panel'
    | 'AI chat panel'
    | 'inline chat panel'
    | 'AI result panel'
    | 'AI chat block';
  control:
    | 'stop button'
    | 'format toolbar'
    | 'AI chat send button'
    | 'Block action bar'
    | 'paywall'
    | 'policy wall'
    | 'server error'
    | 'login required'
    | 'request timeout'
    | 'insert'
    | 'replace'
    | 'use as caption'
    | 'discard'
    | 'retry'
    | 'add note'
    | 'add page'
    | 'continue in chat';
  type:
    | 'doc' // synced doc
    | 'note' // note shape
    | 'text'
    | 'image'
    | 'draw object'
    | 'chatbox text'
    | 'other';
  category: string;
  other: Record<string, unknown>;
  docId?: string;
  workspaceId: string;
};

type SubjectValue<T> = T extends Subject<infer U> ? U : never;

type BlocksuiteActionEvent = SubjectValue<typeof AIProvider.slots.actions>;

const trackAction = ({
  eventName,
  properties,
}: {
  eventName: AIActionEventName;
  properties: AIActionEventProperties;
}) => {
  tracker.track(eventName, properties);
};

const inferPageMode = (host: EditorHost) => {
  return host.querySelector('affine-page-root') ? 'doc' : 'edgeless';
};

const defaultActionOptions = [
  'stream',
  'input',
  'content',
  'stream',
  'attachments',
  'signal',
  'docId',
  'workspaceId',
  'host',
  'models',
  'control',
  'where',
  'seed',
];

function isElementModel(
  model: BlockModel | ElementModel
): model is ElementModel {
  return !isBlockModel(model);
}

function isBlockModel(model: BlockModel | ElementModel): model is BlockModel {
  return 'flavour' in model;
}

function inferObjectType(event: BlocksuiteActionEvent) {
  const models: (BlockModel | ElementModel)[] | undefined =
    event.options.models;
  if (!models) {
    if (event.action === 'chat') {
      return 'chatbox text';
    } else if (event.options.attachments?.length) {
      return 'image';
    } else {
      return 'text';
    }
  } else if (models.every(isElementModel)) {
    return 'draw object';
  } else if (models.every(isBlockModel)) {
    const flavour = models[0].flavour;
    if (flavour === 'affine:note') {
      return 'note';
    } else if (
      ['affine:paragraph', 'affine:list', 'affine:code'].includes(flavour)
    ) {
      return 'text';
    } else if (flavour === 'affine:image') {
      return 'image';
    }
  }
  return 'other';
}

function inferSegment(
  event: BlocksuiteActionEvent
): AIActionEventProperties['segment'] {
  if (event.options.where === 'inline-chat-panel') {
    return 'inline chat panel';
  } else if (event.event.startsWith('result:')) {
    return 'AI result panel';
  } else if (event.options.where === 'chat-panel') {
    return 'right side bar';
  } else if (event.options.where === 'ai-chat-block') {
    return 'AI chat block';
  } else {
    return 'AI action panel';
  }
}

function inferModule(
  event: BlocksuiteActionEvent
): AIActionEventProperties['module'] {
  if (event.options.where === 'chat-panel') {
    return 'AI chat panel';
  } else if (event.event === 'result:discard') {
    return 'exit confirmation';
  } else if (event.event.startsWith('result:')) {
    return 'AI result panel';
  } else if (event.options.where === 'inline-chat-panel') {
    return 'inline chat panel';
  } else if (event.options.where === 'ai-chat-block') {
    return 'AI chat block';
  } else {
    return 'AI action panel';
  }
}

function inferEventName(
  event: BlocksuiteActionEvent
): AIActionEventName | null {
  if (['result:discard', 'result:retry'].includes(event.event)) {
    return 'AI result discarded';
  } else if (event.event.startsWith('result:')) {
    return 'AI result accepted';
  } else if (event.event.startsWith('aborted:')) {
    return 'AI action aborted';
  } else if (event.event === 'started') {
    return 'AI action invoked';
  }
  return null;
}

function inferControl(
  event: BlocksuiteActionEvent
): AIActionEventProperties['control'] {
  if (event.event === 'aborted:stop') {
    return 'stop button';
  } else if (event.event === 'aborted:paywall') {
    return 'paywall';
  } else if (event.event === 'aborted:server-error') {
    return 'server error';
  } else if (event.event === 'aborted:login-required') {
    return 'login required';
  } else if (event.event === 'aborted:timeout') {
    return 'request timeout';
  } else if (event.options.control === 'chat-send') {
    return 'AI chat send button';
  } else if (event.options.control === 'block-action-bar') {
    return 'Block action bar';
  } else if (event.event === 'result:add-note') {
    return 'add note';
  } else if (event.event === 'result:add-page') {
    return 'add page';
  } else if (event.event === 'result:continue-in-chat') {
    return 'continue in chat';
  } else if (event.event === 'result:insert') {
    return 'insert';
  } else if (event.event === 'result:replace') {
    return 'replace';
  } else if (event.event === 'result:use-as-caption') {
    return 'use as caption';
  } else if (event.event === 'result:discard') {
    return 'discard';
  } else if (event.event === 'result:retry') {
    return 'retry';
  } else {
    return 'format toolbar';
  }
}

const toTrackedOptions = (
  event: BlocksuiteActionEvent
): {
  eventName: AIActionEventName;
  properties: AIActionEventProperties;
} | null => {
  const eventName = inferEventName(event);

  if (!eventName) return null;

  const pageMode = event.options.host
    ? inferPageMode(event.options.host)
    : 'unknown';
  const otherProperties = omit(event.options, defaultActionOptions);
  const type = inferObjectType(event);
  const segment = inferSegment(event);
  const module = inferModule(event);
  const control = inferControl(event);
  const category = lowerCase(event.action);

  return {
    eventName,
    properties: {
      page: pageMode,
      segment,
      category,
      module,
      control,
      type,
      other: otherProperties,
      docId: event.options.docId,
      workspaceId: event.options.workspaceId,
    },
  };
};

export function setupTracker() {
  AIProvider.slots.requestUpgradePlan.subscribe(() => {
    track.$.paywall.aiAction.viewPlans();
  });

  AIProvider.slots.requestLogin.subscribe(() => {
    track.doc.editor.aiActions.requestSignIn();
  });

  AIProvider.slots.actions.subscribe(event => {
    const properties = toTrackedOptions(event);
    if (properties) {
      trackAction(properties);
    }
  });
}
