import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import { ChatMessageHistory } from 'langchain/memory';
import {
  AIChatMessage,
  type BaseChatMessage,
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

interface ChatMessageDBV2 extends ChatMessageDBV1 {
  followingUp: {
    key: string;
    value: {
      /**
       * ID of the chat
       */
      id: string;
      question: string[];
    };
  };
}

export const conversationHistoryDBName = 'affine-copilot-chat';

export class IndexedDBChatMessageHistory extends ChatMessageHistory {
  public id: string;
  private chatMessages: BaseChatMessage[] = [];

  private readonly dbPromise: Promise<IDBPDatabase<ChatMessageDBV2>>;
  private readonly initPromise: Promise<void>;

  constructor(id: string) {
    super();
    this.id = id;
    this.chatMessages = [];
    this.dbPromise = openDB<ChatMessageDBV2>('affine-copilot-chat', 2, {
      upgrade(database, oldVersion) {
        if (oldVersion === 0) {
          database.createObjectStore('chat', {
            keyPath: 'id',
          });
          database.createObjectStore('followingUp', {
            keyPath: 'id',
          });
        } else if (oldVersion === 1) {
          database.createObjectStore('followingUp', {
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
        this.chatMessages = chat.messages.map(message => {
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

  public async saveFollowingUp(question: string[]): Promise<void> {
    await this.initPromise;
    const db = await this.dbPromise;
    const t = db
      .transaction('followingUp', 'readwrite')
      .objectStore('followingUp');
    await t.put({
      id: this.id,
      question,
    });
  }

  public async getFollowingUp(): Promise<string[]> {
    await this.initPromise;
    const db = await this.dbPromise;
    const t = db
      .transaction('followingUp', 'readonly')
      .objectStore('followingUp');
    const chat = await t.get(this.id);
    if (chat != null) {
      return chat.question;
    }
    return [];
  }

  override async addMessage(message: BaseChatMessage): Promise<void> {
    await this.initPromise;
    this.chatMessages.push(message);
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

  override async addAIChatMessage(message: string): Promise<void> {
    await this.addMessage(new AIChatMessage(message));
  }

  override async addUserMessage(message: string): Promise<void> {
    await this.addMessage(new HumanChatMessage(message));
  }

  override async clear(): Promise<void> {
    await this.initPromise;
    this.chatMessages = [];
    const db = await this.dbPromise;
    const objectStore = db.transaction('chat', 'readwrite').objectStore('chat');
    await objectStore.delete(this.id);
  }

  override async getMessages(): Promise<BaseChatMessage[]> {
    return this.initPromise.then(() => this.chatMessages);
  }
}
