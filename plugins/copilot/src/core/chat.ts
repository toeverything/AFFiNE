import { ConversationChain } from 'langchain/chains';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { BufferMemory } from 'langchain/memory';
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
} from 'langchain/prompts';
import { type LLMResult } from 'langchain/schema';

import { IndexedDBChatMessageHistory } from './langchain/message-history';
import { chatPrompt } from './prompts';

declare global {
  interface WindowEventMap {
    'llm-start': CustomEvent;
    'llm-new-token': CustomEvent<{ token: string }>;
  }
}

export async function createChatAI(
  room: string,
  openAIApiKey: string
): Promise<ConversationChain> {
  if (!openAIApiKey) {
    console.warn('OpenAI API key not set, chat will not work');
  }
  const chat = new ChatOpenAI({
    streaming: true,
    modelName: 'gpt-4',
    temperature: 0.5,
    openAIApiKey: openAIApiKey,
    callbacks: [
      {
        async handleLLMStart(
          llm: { name: string },
          prompts: string[],
          runId: string,
          parentRunId?: string,
          extraParams?: Record<string, unknown>
        ) {
          console.log(
            'handleLLMStart',
            llm,
            prompts,
            runId,
            parentRunId,
            extraParams
          );
          window.dispatchEvent(new CustomEvent('llm-start'));
        },
        async handleLLMNewToken(
          token: string,
          runId: string,
          parentRunId?: string
        ) {
          console.log('handleLLMNewToken', token, runId, parentRunId);
          window.dispatchEvent(
            new CustomEvent('llm-new-token', { detail: { token } })
          );
        },
        async handleLLMEnd(
          output: LLMResult,
          runId: string,
          parentRunId?: string
        ) {
          console.log('handleLLMEnd', output, runId, parentRunId);
        },
      },
    ],
  });

  const chatPromptTemplate = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(chatPrompt),
    new MessagesPlaceholder('history'),
    HumanMessagePromptTemplate.fromTemplate('{input}'),
  ]);

  return new ConversationChain({
    memory: new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new IndexedDBChatMessageHistory(room),
    }),
    prompt: chatPromptTemplate,
    llm: chat,
  });
}
