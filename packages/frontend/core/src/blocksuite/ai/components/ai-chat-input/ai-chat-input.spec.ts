/**
 * @vitest-environment happy-dom
 */
import { signal } from '@preact/signals-core';
import { Framework, MemoryMemento } from '@toeverything/infra';
import { afterEach, expect, test, vi } from 'vitest';

import {
  type AIDraftGlobal,
  AIDraftService,
} from '../../../../modules/ai-button/services/ai-draft';
import {
  CacheStorage,
  GlobalState,
} from '../../../../modules/storage/providers/global';
import { GlobalStateService } from '../../../../modules/storage/services/global';
import { AIChatRuntime, DocAIChatSessionStrategy } from '../../runtime/chat';
import type { AIRequestService } from '../../runtime/request';
import { AIChatContent } from '../ai-chat-content/ai-chat-content';
import { AIChatInput } from './ai-chat-input';

vi.unstubAllGlobals();
customElements.define('ai-chat-input', AIChatInput);
customElements.define('ai-chat-content', AIChatContent);

function createInput() {
  const input = new AIChatInput();
  const textarea = document.createElement('textarea');
  textarea.value = 'pending question';
  input.isInputEmpty = false;
  Object.defineProperty(input, 'textarea', { value: textarea });
  input.chatContextValue = {
    images: [new File(['image'], 'image.png', { type: 'image/png' })],
    quote: 'selected quote',
    markdown: 'selected markdown',
  } as AIChatInput['chatContextValue'];
  const globalState = new MemoryMemento();
  const files = new MemoryMemento();
  const cache: CacheStorage = {
    get: async <T>(key: string) => files.get<T>(key),
    set: async (key, value) => {
      files.set(key, value);
    },
    del: async key => {
      files.del(key);
    },
    clear: async () => {
      files.clear();
    },
    keys: async () => files.keys(),
    watch: <T>(key: string) => files.watch<T>(key),
  };
  const image = input.chatContextValue.images[0];
  const cacheKey = 'AIDraftFile:' + image.name + image.size;
  files.set(cacheKey, new TextEncoder().encode('image').buffer);
  globalState.set<AIDraftGlobal>('AIDrafts', {
    input: textarea.value,
    quote: 'selected quote',
    markdown: 'selected markdown',
    images: [
      { name: image.name, size: image.size, type: image.type, cacheKey },
    ],
  });
  const framework = new Framework();
  framework
    .impl(GlobalState, globalState)
    .impl(CacheStorage, cache)
    .service(GlobalStateService, [GlobalState])
    .service(AIDraftService, [GlobalStateService, CacheStorage]);
  input.aiDraftService = framework.provider().get(AIDraftService);
  const setDraft = vi.spyOn(input.aiDraftService, 'setDraft');
  const content = new AIChatContent();
  content.aiDraftService = input.aiDraftService;
  content.chatContextValue = {
    ...content.chatContextValue,
    ...input.chatContextValue,
  };
  input.updateContext = change => {
    content['updateContext'](change);
    input.chatContextValue = content.chatContextValue;
  };
  const settleDrafts = async () => {
    for (const result of setDraft.mock.results) {
      if (result.type === 'return') await result.value;
    }
  };
  input.chips = [];
  input.reasoningConfig = { enabled: signal(false), setEnabled: vi.fn() };
  input.aiToolsConfigService = {
    config: { value: {} },
  } as AIChatInput['aiToolsConfigService'];
  input.aiModelService = {
    modelId: { value: 'test-model' },
  } as AIChatInput['aiModelService'];

  let finish!: () => void;
  const finished = new Promise<void>(resolve => {
    finish = resolve;
  });
  const request = {
    createSessionWithHistory: vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      docId: 'doc-1',
      messages: [],
    }),
    executeAction: vi.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        await finished;
        yield 'answer';
      },
    }),
    getActiveEditorContext: vi.fn(),
    histories: { ids: vi.fn().mockResolvedValue([]) },
  } as unknown as AIRequestService;
  input.runtime = new AIChatRuntime({
    scope: { kind: 'doc', workspaceId: 'workspace-1', docId: 'doc-1' },
    request,
    strategy: new DocAIChatSessionStrategy(),
  });
  const dispatch = vi.spyOn(input.runtime, 'dispatch');
  return {
    input,
    textarea,
    setDraft,
    dispatch,
    finish,
    globalState,
    cache,
    settleDrafts,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('keeps input and attachments on preparation failure and clears them on accepted retry before streaming finishes', async () => {
  const {
    input,
    textarea,
    setDraft,
    dispatch,
    finish,
    globalState,
    settleDrafts,
  } = createInput();
  const originalImages = input.chatContextValue.images;
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementationOnce(
    function (this: FileReader) {
      this.dispatchEvent(new ProgressEvent('error'));
    }
  );

  await expect(
    input['_onTextareaSend'](new MouseEvent('click'))
  ).rejects.toBeDefined();
  expect(textarea.value).toBe('pending question');
  expect(input.isInputEmpty).toBe(false);
  expect(setDraft).not.toHaveBeenCalled();
  expect(input.chatContextValue.images).toEqual(originalImages);
  expect(input.chatContextValue.quote).toBe('selected quote');
  expect(dispatch).not.toHaveBeenCalled();

  const completion = input['_onTextareaSend'](new MouseEvent('click'));
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
  expect(textarea.value).toBe('');
  expect(input.isInputEmpty).toBe(true);
  expect(setDraft).toHaveBeenCalledWith({ input: '' });
  expect(input.chatContextValue.images).toEqual([]);
  expect(input.chatContextValue.quote).toBe('');
  expect(input.runtime?.getSnapshot().status).toBe('loading');
  await settleDrafts();
  expect(globalState.get('AIDrafts')).toMatchObject({
    input: '',
    images: [],
    quote: '',
    markdown: '',
  });
  finish();
  await completion;
  expect(input.runtime?.getSnapshot().status).toBe('success');
});

test('preserves edits and newly attached images while preparing and ignores duplicate submission', async () => {
  const {
    input,
    textarea,
    setDraft,
    dispatch,
    finish,
    globalState,
    settleDrafts,
  } = createInput();
  const readers: FileReader[] = [];
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementationOnce(
    function (this: FileReader) {
      readers.push(this);
    }
  );
  const sentImage = input.chatContextValue.images[0];
  const completion = input['_onTextareaSend'](new MouseEvent('click'));
  await input['_onTextareaSend'](new MouseEvent('click'));
  expect(dispatch).not.toHaveBeenCalled();

  textarea.value = 'next question';
  await input['_handleInput']();
  const nextImage = new File(['new image'], 'next.png', { type: 'image/png' });
  input.updateContext({
    images: [sentImage, nextImage],
    quote: 'new quote',
    markdown: 'new markdown',
  });
  const reader = readers[0];
  Object.defineProperty(reader, 'result', {
    value: 'data:image/png;base64,aW1hZ2U=',
  });
  reader.dispatchEvent(new ProgressEvent('load'));
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());

  expect(textarea.value).toBe('next question');
  expect(setDraft).not.toHaveBeenCalledWith({ input: '' });
  expect(input.chatContextValue.images).toEqual([nextImage]);
  expect(input.chatContextValue.quote).toBe('new quote');
  expect(input.chatContextValue.markdown).toBe('new markdown');
  await settleDrafts();
  expect(globalState.get('AIDrafts')).toMatchObject({
    input: 'next question',
    images: [{ name: 'next.png' }],
    quote: 'new quote',
    markdown: 'new markdown',
  });
  expect(dispatch.mock.calls[0][0]).toMatchObject({
    input: 'pending question',
    attachments: [sentImage],
  });
  finish();
  await completion;
});

test.each(['unavailable', 'busy'] as const)(
  'keeps the draft when the runtime is %s',
  async mode => {
    const { input, textarea, setDraft, finish, settleDrafts } = createInput();
    let competingSend: Promise<void> | undefined;
    input.updateContext({ images: [] });
    await settleDrafts();
    setDraft.mockClear();
    if (mode === 'unavailable') input.runtime = null;
    if (mode === 'busy') {
      competingSend = input.runtime!.dispatch({
        type: 'send',
        input: 'another sender',
      });
    }
    await input['_onTextareaSend'](new MouseEvent('click'));
    expect(textarea.value).toBe('pending question');
    expect(setDraft).not.toHaveBeenCalled();
    finish();
    await competingSend;
  }
);

test('keeps the draft when another sender occupies the runtime during preparation', async () => {
  const { input, textarea, setDraft, finish } = createInput();
  const readers: FileReader[] = [];
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementationOnce(
    function (this: FileReader) {
      readers.push(this);
    }
  );
  const originalImages = input.chatContextValue.images;
  const completion = input['_onTextareaSend'](new MouseEvent('click'));
  const competingSend = input.runtime!.dispatch({
    type: 'send',
    input: 'another sender',
  });
  const reader = readers[0];
  Object.defineProperty(reader, 'result', {
    value: 'data:image/png;base64,aW1hZ2U=',
  });
  reader.dispatchEvent(new ProgressEvent('load'));
  await completion;
  expect(textarea.value).toBe('pending question');
  expect(input.chatContextValue.images).toEqual(originalImages);
  expect(setDraft).not.toHaveBeenCalled();
  finish();
  await competingSend;
});

test.each(['deferred', 'failed'] as const)(
  'persists accepted cleanup and later edits in order with a %s file cache write',
  async mode => {
    const {
      input,
      textarea,
      dispatch,
      finish,
      globalState,
      cache,
      settleDrafts,
    } = createInput();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    const del = cache.del.bind(cache);
    vi.spyOn(cache, 'del').mockImplementationOnce(async key => {
      if (mode === 'failed') throw new Error('cache unavailable');
      await held;
      await del(key);
    });
    const completion = input['_onTextareaSend'](new MouseEvent('click'));
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
    expect(textarea.value).toBe('');
    textarea.value = 'next persisted question';
    const edit = input['_handleInput']();
    release();
    await edit;
    if (mode === 'failed') {
      await expect(settleDrafts()).rejects.toThrow('cache unavailable');
      expect(consoleError).toHaveBeenCalled();
    } else {
      await settleDrafts();
    }
    expect(await input.aiDraftService!.getDraft()).toMatchObject({
      input: 'next persisted question',
      images: [],
      quote: '',
      markdown: '',
    });
    expect(globalState.get('AIDrafts')).toMatchObject({
      input: 'next persisted question',
      images: [],
      quote: '',
      markdown: '',
    });
    finish();
    await completion;
  }
);
