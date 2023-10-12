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
import { followupQuestionParser } from './prompts/output-parser';

export type ChatAI = {
  // Core chat AI
  conversationChain: ConversationChain;
  // Followup AI, used to generate followup questions
  followupChain: LLMChain<string>;
  // Chat history, used to store messages
  chatHistory: IndexedDBChatMessageHistory;
};

export type ChatAIConfig = {
  events: {
    llmStart: () => void;
    llmNewToken: (token: string) => void;
  };
};

export async function createChatAI(
  room: string,
  openAIApiKey: string,
  config: ChatAIConfig
): Promise<ChatAI> {
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
        async handleLLMStart() {
          config.events.llmStart();
        },
        async handleLLMNewToken(token) {
          config.events.llmNewToken(token);
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
    partialVariables: {
      format_instructions: followupQuestionParser.getFormatInstructions(),
    },
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
  };
}
