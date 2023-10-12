import { atom, useAtomValue } from 'jotai';
import { atomWithDefault, atomWithStorage } from 'jotai/utils';
import type { WritableAtom } from 'jotai/vanilla';
import type { PrimitiveAtom } from 'jotai/vanilla';
import type { LLMChain } from 'langchain/chains';
import { type ConversationChain } from 'langchain/chains';
import { type BufferMemory } from 'langchain/memory';
import type { BaseMessage } from 'langchain/schema';
import { AIMessage } from 'langchain/schema';
import { HumanMessage } from 'langchain/schema';

import type { ChatAI, ChatAIConfig } from '../chat';
import { createChatAI } from '../chat';
import type { IndexedDBChatMessageHistory } from '../langchain/message-history';
import { followupQuestionParser } from '../prompts/output-parser';

export const openAIApiKeyAtom = atomWithStorage<string | null>(
  'com.affine.copilot.openai.token',
  null
);

const conversationBaseWeakMap = new WeakMap<
  ConversationChain,
  PrimitiveAtom<BaseMessage[]>
>();
const conversationWeakMap = new WeakMap<
  ConversationChain,
  WritableAtom<BaseMessage[], [string], Promise<void>>
>();

export const chatAtom = atom<Promise<ChatAI>>(async get => {
  const openAIApiKey = get(openAIApiKeyAtom);
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not set, chat will not work');
  }
  const events: ChatAIConfig['events'] = {
    llmStart: () => {
      throw new Error('llmStart not set');
    },
    llmNewToken: () => {
      throw new Error('llmNewToken not set');
    },
  };
  const chatAI = await createChatAI('default-copilot', openAIApiKey, {
    events,
  });
  getOrCreateConversationAtom(chatAI.conversationChain);
  const baseAtom = conversationBaseWeakMap.get(chatAI.conversationChain);
  if (!baseAtom) {
    throw new TypeError();
  }
  baseAtom.onMount = setAtom => {
    const memory = chatAI.conversationChain.memory as BufferMemory;
    memory.chatHistory
      .getMessages()
      .then(messages => {
        setAtom(messages);
      })
      .catch(err => {
        console.error(err);
      });
    events.llmStart = () => {
      setAtom(conversations => [...conversations, new AIMessage('')]);
    };
    events.llmNewToken = token => {
      setAtom(conversations => {
        const last = conversations[conversations.length - 1] as AIMessage;
        last.content += token;
        return [...conversations];
      });
    };
  };
  return chatAI;
});

const getOrCreateConversationAtom = (chat: ConversationChain) => {
  if (conversationWeakMap.has(chat)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return conversationWeakMap.get(chat)!;
  }
  const conversationBaseAtom = atom<BaseMessage[]>([]);
  conversationBaseWeakMap.set(chat, conversationBaseAtom);

  const conversationAtom = atom<BaseMessage[], [string], Promise<void>>(
    get => get(conversationBaseAtom),
    async (get, set, input) => {
      if (!chat) {
        throw new Error();
      }
      // set dirty value
      set(conversationBaseAtom, [
        ...get(conversationBaseAtom),
        new HumanMessage(input),
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
    questionsAtom: ReturnType<
      typeof atomWithDefault<Promise<string[]> | string[]>
    >;
    generateChatAtom: WritableAtom<null, [], void>;
  }
>();

const getFollowingUpAtoms = (
  followupLLMChain: LLMChain<string>,
  chatHistory: IndexedDBChatMessageHistory
) => {
  if (followingUpWeakMap.has(followupLLMChain)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return followingUpWeakMap.get(followupLLMChain)!;
  }
  const baseAtom = atomWithDefault<Promise<string[]> | string[]>(async () => {
    return chatHistory?.getFollowingUp() ?? [];
  });
  const setAtom = atom<null, [], void>(null, async (_, set) => {
    if (!followupLLMChain || !chatHistory) {
      throw new Error('followupLLMChain not set');
    }
    const messages = await chatHistory.getMessages();
    const aiMessage = messages.findLast(message => message._getType() === 'ai')
      ?.text;
    const humanMessage = messages.findLast(
      message => message._getType() === 'human'
    )?.text;
    const response = await followupLLMChain.call({
      ai_conversation: aiMessage,
      human_conversation: humanMessage,
    });
    const followingUp = await followupQuestionParser.parse(response.text);
    set(baseAtom, followingUp.followupQuestions);
    chatHistory.saveFollowingUp(followingUp.followupQuestions).catch(() => {
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
  conversationAtom: ReturnType<typeof getOrCreateConversationAtom>;
  followingUpAtoms: ReturnType<typeof getFollowingUpAtoms>;
} {
  const chat = useAtomValue(chatAtom);
  const conversationAtom = getOrCreateConversationAtom(chat.conversationChain);
  const followingUpAtoms = getFollowingUpAtoms(
    chat.followupChain,
    chat.chatHistory
  );
  return {
    conversationAtom,
    followingUpAtoms,
  };
}
