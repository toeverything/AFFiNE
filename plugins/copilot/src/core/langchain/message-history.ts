import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import {
  AIChatMessage,
  type BaseChatMessage,
  BaseChatMessageHistory,
  ChatMessage,
  HumanChatMessage,
  type StoredMessage,
  SystemChatMessage,
} from 'langchain/schema';

interface ChatMessageDBV1 extends DBSchema {
  chat: {
    key: string;
    value: {
      /**
       * ID of the chat
       */
      id: string;
      messages: StoredMessage[];
    };
  };
}

export const conversationHistoryDBName = 'affine-copilot-chat';

export class IndexedDBChatMessageHistory extends BaseChatMessageHistory {
  public id: string;
  private messages: BaseChatMessage[] = [];

  private readonly dbPromise: Promise<IDBPDatabase<ChatMessageDBV1>>;
  private readonly initPromise: Promise<void>;

  constructor(id: string) {
    super();
    this.id = id;
    this.messages = [];
    this.dbPromise = openDB<ChatMessageDBV1>('affine-copilot-chat', 1, {
      upgrade(database, oldVersion) {
        if (oldVersion === 0) {
          database.createObjectStore('chat', {
            keyPath: 'id',
          });
        }
      },
    });
    this.initPromise = this.dbPromise.then(async db => {
      const objectStore = db
        .transaction('chat', 'readonly')
        .objectStore('chat');
      const chat = await objectStore.get(id);
      if (chat != null) {
        this.messages = chat.messages.map(message => {
          switch (message.type) {
            case 'ai':
              return new AIChatMessage(message.data.content);
            case 'human':
              return new HumanChatMessage(message.data.content);
            case 'system':
              return new SystemChatMessage(message.data.content);
            default:
              return new ChatMessage(
                message.data.content,
                message.data.role ?? 'never'
              );
          }
        });
      }
    });
  }

  protected async addMessage(message: BaseChatMessage): Promise<void> {
    await this.initPromise;
    this.messages.push(message);
    const db = await this.dbPromise;
    const objectStore = db.transaction('chat', 'readwrite').objectStore('chat');
    const chat = await objectStore.get(this.id);
    if (chat != null) {
      chat.messages.push(message.toJSON());
      await objectStore.put(chat);
    } else {
      await objectStore.add({
        id: this.id,
        messages: [message.toJSON()],
      });
    }
  }

  async addAIChatMessage(message: string): Promise<void> {
    await this.addMessage(new AIChatMessage(message));
  }

  async addUserMessage(message: string): Promise<void> {
    await this.addMessage(new HumanChatMessage(message));
  }

  async clear(): Promise<void> {
    await this.initPromise;
    this.messages = [];
    const db = await this.dbPromise;
    const objectStore = db.transaction('chat', 'readwrite').objectStore('chat');
    await objectStore.delete(this.id);
  }

  async getMessages(): Promise<BaseChatMessage[]> {
    return await this.initPromise.then(() => this.messages);
  }
}
