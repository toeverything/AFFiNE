import type { BrowserContext, Page, Request } from '@playwright/test';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[];
  params?: Record<string, string>;
};

const FIXED_RESULT: Record<string, string> = {
  'I is a student': 'I am a student',
  '```javascript\nconsloe.log("Hello,World!");\n```\n': 'console',
  'AFFiNE is a workspace with fully merged docs':
    'AFFiNE is a workspace with fully merged docs, ',
  'LLM(AI)': 'Large Language Model',
  LLM: 'Large Language Model',
  Appel: 'Apple',
  Apple: 'Apple Apfel',
  Panda: `
  - Panda is a bear-like animal.
    - It is native to China.
      - It is known for its black and white fur.
        - It is a herbivore and primarily eats bamboo.
        - It is a symbol of conservation efforts.
  `,
  'Mind Map': `
  - Panda is a bear-like animal.
    - It is native to China.
      - It is known for its black and white fur.
        - It is a herbivore and primarily eats bamboo.
        - It is a symbol of conservation efforts.
  `,
};

const initScript = `
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = MockEventSource.CONNECTING;

  url = '';
  eventSourceInitDict = {};
  eventListenerMap = {};

  constructor(url, eventSourceInitDict) {
    fetch(url)
    window.MockEventSourceInstance = this;
    this.url = url;
    this.eventSourceInitDict = eventSourceInitDict;
  }

  addEventListener(event, cb) {
    this.eventListenerMap[event] = cb;
  }

  close() {
    window.MockEventSourceInstance = null;
    this.readyState = MockEventSource.CLOSED;
  }

  triggerEvent(event, data) {
    if (this.eventListenerMap[event]) {
      this.eventListenerMap[event](data);
    }
  }
}

window.EventSource = MockEventSource;

console.log('MockEventSource loaded');
`;

export class MockApiUtils {
  public static async init(context: BrowserContext, page: Page) {
    const apiUtils = new MockApiUtils(page);
    await apiUtils.mockApis();

    await context.addInitScript({
      content: initScript,
    });

    return apiUtils;
  }

  private readonly sessions: Record<
    string,
    { action: string; messages: string[] }
  > = {};
  private readonly historiesMessages: Record<string, ChatMessage> = {};

  constructor(private page: Page) {}

  private getPostData(req: Request) {
    try {
      return req.postDataJSON();
    } catch {}

    try {
      const buffer = req.postDataBuffer();
      if (buffer) {
        const formData: Record<string, string> = {};
        const boundary = req
          .headers()
          ['content-type']?.match(/boundary=(.*)$/)?.[1];
        if (boundary) {
          const parts = buffer.toString().split(`--${boundary}`);
          for (const part of parts) {
            if (!part.trim()) continue;
            const [headerStr, ...contentParts] = part.split('\r\n\r\n');
            const content = contentParts.join('\r\n\r\n').trim();
            const headers = headerStr.split('\r\n').reduce(
              (acc, header) => {
                const [key, value] = header.trim().split(': ');
                if (key && value) {
                  acc[key.toLowerCase()] = value.trim();
                }
                return acc;
              },
              {} as Record<string, string>
            );

            // Get field name and check if it's a file
            const contentDisposition = headers['content-disposition'] || '';
            const nameMatch = contentDisposition.match(/name="([^"]+)"/);
            if (nameMatch) {
              const name = nameMatch[1];
              formData[name] = content;
            }
          }
          return formData;
        }
      }
    } catch {}
    return null;
  }

  private getResult(msg: ChatMessage) {
    if (msg.attachments?.length) {
      return 'kitten';
    }

    const content = msg.content;
    const rawContent = msg.params?.content;

    if (rawContent) {
      return FIXED_RESULT[rawContent] || rawContent;
    } else if (content) {
      return FIXED_RESULT[content] || content;
    }

    return 'generate text to text';
  }

  private getHistory() {
    const histories = [];
    for (const sessionId in this.sessions) {
      const { action, messages } = this.sessions[sessionId];
      histories.push({
        sessionId,
        tokens: 0,
        action,
        createdAt: new Date().toISOString(),
        messages: [
          {
            id: null,
            role: 'user',
            content: '',
            attachments: null,
            createdAt: new Date().toISOString(),
          },
          ...messages.map(msgId => ({
            id: msgId,
            role: this.historiesMessages[msgId]?.role ?? 'user',
            content: this.historiesMessages[msgId]?.content || '',
            attachments: null,
            createdAt: new Date().toISOString(),
          })),
        ],
      });
    }
    return histories;
  }

  async mockApis() {
    await this.page.route('*/**/graphql', async route => {
      try {
        const response = await route.fetch();
        const json = await response.json();
        if (json.data?.createCopilotSession) {
          const id = json.data.createCopilotSession;
          const action = this.getPostData(route.request())?.variables?.options
            ?.promptName;
          this.sessions[id] = { action, messages: [] };
        } else if (json.data?.createCopilotMessage) {
          const id = json.data.createCopilotMessage;
          const operations = this.getPostData(route.request())?.operations;
          if (operations) {
            const options = JSON.parse(operations)?.variables?.options;
            const { content, params, sessionId } = options;
            this.historiesMessages[id] = { role: 'user', content, params };
            this.sessions[sessionId].messages.push(id);
          }
        } else if (json.data?.currentUser?.copilot?.histories) {
          const histories = this.getHistory();
          const json1 = { data: { currentUser: { copilot: { histories } } } };
          await route.fulfill({ response, json: json1 });
          return;
        }
        await route.fulfill({ response, json });
      } catch {
        await route.abort();
      }
    });

    await this.page.route('*/**/copilot/chat/**', async route => {
      try {
        const url = new URL(route.request().url());
        //     .GET(`/api/copilot/chat/${sessionId}${prefix}${query}`)
        const sessionId = url.pathname.match(/\/chat\/([^/]+)/)?.[1];
        const messageId = url.searchParams.get('messageId');
        const session = this.sessions[sessionId!];
        const message = this.historiesMessages[messageId!];
        if (session && message) {
          const returnMessageId = Math.random().toString().substr(2);
          const result = this.getResult(message);

          this.historiesMessages[returnMessageId] = {
            role: 'assistant',
            content: result,
          };
          session.messages.push(returnMessageId);

          if (url.pathname.endsWith('/stream')) {
            await this.page.evaluate(
              data => {
                const _window = window as any;
                _window.MockEventSourceInstance.triggerEvent('message', data);
                setTimeout(() => {
                  _window.MockEventSourceInstance.triggerEvent('error', {});
                }, 500);
              },
              {
                type: 'message',
                id: messageId,
                data: result,
              }
            );

            await route.fulfill({ status: 200 });
          } else {
            await route.fulfill({ body: result });
          }
          return;
        }

        const response = await route.fetch();
        await route.fulfill({ response });
      } catch {
        await route.abort();
      }
    });
  }
}
