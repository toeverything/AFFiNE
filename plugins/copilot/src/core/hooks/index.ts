import type { IndexedDBChatMessageHistory } from '@affine/copilot/core/langchain/message-history';
import { atom, useAtomValue } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { atomWithStorage } from 'jotai/utils';
import type { LLMChain } from 'langchain/chains';
import { type ConversationChain } from 'langchain/chains';
import { type BufferMemory } from 'langchain/memory';
import {
  AIChatMessage,
  type BaseChatMessage,
  HumanChatMessage,
} from 'langchain/schema';
import { z } from 'zod';

import { createChatAI } from '../chat';

const followupResponseSchema = z.array(z.string());

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

const conversationAtomFamily = atomFamily(
  (chat: ConversationChain | undefined) => {
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
  }
);

const getFollowupAtom = (
  followupLLMChain: LLMChain<string> | undefined,
  chatHistory: IndexedDBChatMessageHistory | undefined
) => {
  return atom<null, [], Promise<string[]>>(null, async () => {
    if (!followupLLMChain || !chatHistory) {
      throw new Error('followupLLMChain not set');
    }
    const messages = await chatHistory.getMessages();
    const aiMessage = messages.findLast(
      message => message._getType() === 'ai'
    )?.text;
    const humanMessage = messages.findLast(
      message => message._getType() === 'human'
    )?.text;
    const response = await followupLLMChain.call({
      ai_conversation: aiMessage,
      human_conversation: humanMessage,
    });
    const follow = JSON.parse(response.text);
    followupResponseSchema.parse(follow);
    return follow;
  });
};

export function useChatAtoms(): {
  conversationAtom: ReturnType<typeof conversationAtomFamily>;
  followupAtom: ReturnType<typeof getFollowupAtom>;
} {
  const chat = useAtomValue(chatAtom);
  const conversationAtom = conversationAtomFamily(chat?.conversationChain);
  const followupAtom = getFollowupAtom(chat?.followupChain, chat?.chatHistory);
  return {
    conversationAtom,
    followupAtom,
  };
}
