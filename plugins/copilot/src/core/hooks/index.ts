import type { IndexedDBChatMessageHistory } from '@affine/copilot/core/langchain/message-history';
import { atom, useAtomValue } from 'jotai';
import { atomWithDefault } from 'jotai/utils';
import { atomWithStorage } from 'jotai/utils';
import type { WritableAtom } from 'jotai/vanilla';
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
    throw new Error('OpenAI API key not set, chat will not work');
  }
  return createChatAI('default-copilot', openAIApiKey);
});

const conversationWeakMap = new WeakMap<
  ConversationChain,
  WritableAtom<BaseChatMessage[], [string], Promise<void>>
>();

const getConversationAtom = (chat: ConversationChain) => {
  if (conversationWeakMap.has(chat)) {
    return conversationWeakMap.get(chat) as WritableAtom<
      BaseChatMessage[],
      [string],
      Promise<void>
    >;
  }
  const conversationBaseAtom = atom<BaseChatMessage[]>([]);
  conversationBaseAtom.onMount = setAtom => {
    if (!chat) {
      throw new Error();
    }
    const memory = chat.memory as BufferMemory;
    memory.chatHistory
      .getMessages()
      .then(messages => {
        setAtom(messages);
      })
      .catch(err => {
        console.error(err);
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

  const conversationAtom = atom<BaseChatMessage[], [string], Promise<void>>(
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
      memory.chatHistory
        .getMessages()
        .then(messages => {
          set(conversationBaseAtom, messages);
        })
        .catch(err => {
          console.error(err);
        });
    }
  );
  conversationWeakMap.set(chat, conversationAtom);
  return conversationAtom;
};

const followingUpWeakMap = new WeakMap<
  LLMChain<string>,
  {
    questionsAtom: ReturnType<typeof atomWithDefault<Promise<string[]>>>;
    generateChatAtom: WritableAtom<null, [], void>;
  }
>();

const getFollowingUpAtoms = (
  followupLLMChain: LLMChain<string>,
  chatHistory: IndexedDBChatMessageHistory
) => {
  if (followingUpWeakMap.has(followupLLMChain)) {
    return followingUpWeakMap.get(followupLLMChain) as {
      questionsAtom: ReturnType<typeof atomWithDefault<Promise<string[]>>>;
      generateChatAtom: WritableAtom<null, [], void>;
    };
  }
  const baseAtom = atomWithDefault<Promise<string[]>>(async () => {
    return chatHistory?.getFollowingUp() ?? [];
  });
  const setAtom = atom<null, [], void>(null, async (get, set) => {
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
    const followingUp = JSON.parse(response.text);
    followupResponseSchema.parse(followingUp);
    set(baseAtom, followingUp);
    chatHistory.saveFollowingUp(followingUp).catch(() => {
      console.error('failed to save followup');
    });
  });
  followingUpWeakMap.set(followupLLMChain, {
    questionsAtom: baseAtom,
    generateChatAtom: setAtom,
  });
  return {
    questionsAtom: baseAtom,
    generateChatAtom: setAtom,
  };
};

export function useChatAtoms(): {
  conversationAtom: ReturnType<typeof getConversationAtom>;
  followingUpAtoms: ReturnType<typeof getFollowingUpAtoms>;
} {
  const chat = useAtomValue(chatAtom);
  const conversationAtom = getConversationAtom(chat.conversationChain);
  const followingUpAtoms = getFollowingUpAtoms(
    chat.followupChain,
    chat.chatHistory
  );
  return {
    conversationAtom,
    followingUpAtoms,
  };
}
