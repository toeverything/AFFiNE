import { ConversationChain, LLMChain } from 'langchain/chains';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { BufferMemory } from 'langchain/memory';
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
  SystemMessagePromptTemplate,
} from 'langchain/prompts';

import { IndexedDBChatMessageHistory } from './langchain/message-history';
import { chatPrompt, followupQuestionPrompt } from './prompts';

declare global {
  interface WindowEventMap {
    'llm-start': CustomEvent;
    'llm-new-token': CustomEvent<{ token: string }>;
  }
}

export async function createChatAI(
  room: string,
  openAIApiKey: string
): Promise<{
  conversationChain: ConversationChain;
  followupChain: LLMChain<string>;
  chatHistory: IndexedDBChatMessageHistory;
}> {
  if (!openAIApiKey) {
    console.warn('OpenAI API key not set, chat will not work');
  }
  const followup = new ChatOpenAI({
    streaming: false,
    modelName: 'gpt-3.5-turbo',
    temperature: 0.5,
    openAIApiKey: openAIApiKey,
  });

  const chat = new ChatOpenAI({
    streaming: true,
    modelName: 'gpt-3.5-turbo',
    temperature: 0.5,
    openAIApiKey: openAIApiKey,
    callbacks: [
      {
        async handleLLMStart(llm, prompts, runId, parentRunId, extraParams) {
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
        async handleLLMNewToken(token, runId, parentRunId) {
          console.log('handleLLMNewToken', token, runId, parentRunId);
          window.dispatchEvent(
            new CustomEvent('llm-new-token', { detail: { token } })
          );
        },
        async handleLLMEnd(output, runId, parentRunId) {
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

  const followupPromptTemplate = new PromptTemplate({
    template: followupQuestionPrompt,
    inputVariables: ['human_conversation', 'ai_conversation'],
  });

  const followupChain = new LLMChain({
    llm: followup,
    prompt: followupPromptTemplate,
    memory: undefined,
  });

  const chatHistory = new IndexedDBChatMessageHistory(room);

  const conversationChain = new ConversationChain({
    memory: new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory,
    }),
    prompt: chatPromptTemplate,
    llm: chat,
  });

  return {
    conversationChain,
    followupChain,
    chatHistory,
  } as const;
}
