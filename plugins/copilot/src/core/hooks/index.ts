import { atom, useAtomValue } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { atomWithStorage } from 'jotai/utils';
import { type ConversationChain } from 'langchain/chains';
import { type BufferMemory } from 'langchain/memory';
import {
  AIChatMessage,
  type BaseChatMessage,
  HumanChatMessage,
} from 'langchain/schema';

import { createChatAI } from '../chat';

export const openAIApiKeyAtom = atomWithStorage<string | null>(
  'com.affine.copilot.openai.token',
  null
);

export const chatAtom = atom(async get => {
  const openAIApiKey = get(openAIApiKeyAtom);
  if (!openAIApiKey) {
    return null;
  }
  return createChatAI('default-copilot', openAIApiKey);
});

const conversationAtomFamily = atomFamily((chat: ConversationChain | null) => {
  const conversationBaseAtom = atom<BaseChatMessage[]>([]);
  conversationBaseAtom.onMount = setAtom => {
    if (!chat) {
      throw new Error();
    }
    const memory = chat.memory as BufferMemory;
    void memory.chatHistory.getMessages().then(messages => {
      setAtom(messages);
    });
    const llmStart = (): void => {
      setAtom(conversations => [...conversations, new AIChatMessage('')]);
    };
    const llmNewToken = (event: CustomEvent<{ token: string }>): void => {
      setAtom(conversations => {
        const last = conversations[conversations.length - 1] as AIChatMessage;
        last.text += event.detail.token;
        return [...conversations];
      });
    };
    window.addEventListener('llm-start', llmStart);
    window.addEventListener('llm-new-token', llmNewToken);
    return () => {
      window.removeEventListener('llm-start', llmStart);
      window.removeEventListener('llm-new-token', llmNewToken);
    };
  };

  return atom<BaseChatMessage[], [string], Promise<void>>(
    get => get(conversationBaseAtom),
    async (get, set, input) => {
      if (!chat) {
        throw new Error();
      }
      // set dirty value
      set(conversationBaseAtom, [
        ...get(conversationBaseAtom),
        new HumanChatMessage(input),
      ]);
      await chat.call({
        input,
      });
      // refresh messages
      const memory = chat.memory as BufferMemory;
      void memory.chatHistory.getMessages().then(messages => {
        set(conversationBaseAtom, messages);
      });
    }
  );
});

export function useChatAtoms(): {
  conversationAtom: ReturnType<typeof conversationAtomFamily>;
} {
  const chat = useAtomValue(chatAtom);
  const conversationAtom = conversationAtomFamily(chat);
  return {
    conversationAtom,
  };
}
