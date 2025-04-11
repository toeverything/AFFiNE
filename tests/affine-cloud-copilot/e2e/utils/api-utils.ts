import type { BrowserContext, Page, Request } from '@playwright/test';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[];
  params?: Record<string, string>;
};

const WORKFLOW_RESULT: Record<string, string> = {
  'workflow:presentation': `
{"page":1,"type":"name","content":"Introduction"}
{"page":1,"type":"title","content":"Apple"}
{"page":1,"type":"content","content":"fruit, technology, brand"}
{"page":1,"type":"content","content":"Explore the diverse world of Apple, from its origins as a fruit to its evolution into a leading technology brand."}
{"page":2,"type":"name","content":"Fruit Origins"}
{"page":2,"type":"title","content":"History of Apple"}
{"page":2,"type":"content","content":"fruit, history, agriculture"}
{"page":2,"type":"content","content":"Apples have been cultivated for thousands of years, originating in Central Asia. They are one of the most popular fruits worldwide, known for their sweet taste and nutritional benefits."}
{"page":2,"type":"title","content":"Nutritional Benefits"}
{"page":2,"type":"content","content":"nutrition, health, vitamins"}
{"page":2,"type":"content","content":"Rich in fiber, vitamins, and antioxidants, apples contribute to a healthy diet. They are linked to numerous health benefits, including improved heart health and reduced risk of certain diseases."}
{"page":3,"type":"name","content":"Cultural Significance"}
{"page":3,"type":"title","content":"Symbolism"}
{"page":3,"type":"content","content":"symbolism, culture, mythology"}
{"page":3,"type":"content","content":"Apples hold significant cultural and symbolic meanings across various societies. They appear in myths, religious texts, and folklore, often representing knowledge, immortality, and temptation."}
{"page":3,"type":"title","content":"Global Varieties"}
{"page":3,"type":"content","content":"varieties, global, diversity"}
{"page":3,"type":"content","content":"There are thousands of apple varieties grown worldwide, each with unique flavors, colors, and textures. Popular types include Fuji, Granny Smith, and Honeycrisp, each suited for different culinary uses."}
{"page":3,"type":"title","content":"Culinary Uses"}
{"page":3,"type":"content","content":"cooking, recipes, cuisine"}
{"page":3,"type":"content","content":"Apples are versatile in the kitchen, used in both sweet and savory dishes. They can be baked, stewed, or eaten raw, and are a staple in pies, salads, and sauces."}`,
  'Make it real with text': `
\`\`\` html
<html>
<body>
<h1>hello world</h1>
</body>
</html>
\`\`\`
`,
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
  'What is EEee?': 'EEee',
  'What is EEee? What is FFff?':
    'EEee[^1]\nFFff[^2]\n\n[^1]: {"type":"url","url":"http%3A%2F%2Fexample.org"}\n[^2]: {"type":"url","url":"http%3A%2F%2Fexample.org"}\n',
  'What is EEee(Use English)':
    'EEee cat[^1]\n\n[^1]: {"type":"url","url":"http%3A%2F%2Fexample.org"}',
  'What is EEee? What is FFff?(Use English)':
    'EEee cat[^1]\nFFff dog[^2]\n\n[^1]: {"type":"url","url":"http%3A%2F%2Fexample.org"}\n[^2]: {"type":"url","url":"http%3A%2F%2Fexample.org"}\n',
  'What is the weather like in Shanghai today?':
    'footnote[^1]\n\n[^1]: {"type":"url","url":"http%3A%2F%2Fexample.org"}',
};

const ACTION_MAP: Record<string, string> = {
  'Improve writing for it': 'Improve the follow text',
  'Make it longer': 'Expand the following text',
  'Make it shorter': 'Shorten the follow text',
  'Make it real with text': 'Write a web page of follow text',
  Summary: 'Summary the follow text',
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

const shouldMock = process.env.ENABLE_COPILOT_MOCK;

export class MockApiUtils {
  public static async init(context: BrowserContext, page: Page) {
    const apiUtils = new MockApiUtils(page);

    if (shouldMock) {
      await apiUtils.mockApis();

      await context.addInitScript({
        content: initScript,
      });
    }

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

  private getResult(msg: ChatMessage, action?: string) {
    if (msg.attachments?.length) {
      return 'kitten';
    } else if (action && WORKFLOW_RESULT[action]) {
      return WORKFLOW_RESULT[action];
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

  private getSessions() {
    return Object.entries(this.sessions).map(([id, { action }]) => ({
      id,
      promptName: action,
    }));
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
            content: ACTION_MAP[action] || action,
            attachments: null,
            createdAt: new Date().toISOString(),
          },
          ...messages.map(msgId => ({
            id: msgId,
            role: this.historiesMessages[msgId]?.role ?? 'user',
            content: this.historiesMessages[msgId]?.content || '',
            attachments: this.historiesMessages[msgId]?.attachments,
            createdAt: new Date().toISOString(),
          })),
        ],
      });
    }
    return histories;
  }

  async mockApis() {
    if (!shouldMock) {
      return;
    }

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
          const data = this.getPostData(route.request());
          if (data && data.operations) {
            const options = JSON.parse(data.operations)?.variables?.options;
            const attach = data['0'];
            const { attachments, content, params, sessionId } = options;
            this.historiesMessages[id] = {
              role: 'user',
              content,
              attachments:
                Array.isArray(attachments) && attach
                  ? ['data:image/gif;base64,R0lGODlhAQABAAAAACw=']
                  : undefined,
              params,
            };
            this.sessions[sessionId].messages.push(id);
          }
        } else if (json.data?.currentUser?.copilot?.histories) {
          const histories = this.getHistory();
          const json1 = { data: { currentUser: { copilot: { histories } } } };
          await route.fulfill({ response, json: json1 });
          return;
        } else if (json.data?.currentUser?.copilot?.sessions) {
          const sessions = this.getSessions();
          const json1 = { data: { currentUser: { copilot: { sessions } } } };
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
          const result = this.getResult(message, session.action);

          this.historiesMessages[returnMessageId] = {
            role: 'assistant',
            content: result,
          };
          session.messages.push(returnMessageId);

          if (
            url.pathname.endsWith('/stream') ||
            url.pathname.endsWith('/workflow')
          ) {
            await this.page.evaluate(
              data => {
                const _window = window as any;
                _window.MockEventSourceInstance.triggerEvent('message', data);
                setTimeout(() => {
                  _window.MockEventSourceInstance?.triggerEvent('error', {});
                }, 500);
              },
              {
                type: 'message',
                id: messageId,
                data: result,
              }
            );

            await route.fulfill({ status: 200 });
          } else if (url.pathname.endsWith('/images')) {
            await this.page.evaluate(
              data => {
                const _window = window as any;
                _window.MockEventSourceInstance.triggerEvent(
                  'attachment',
                  data
                );
                setTimeout(() => {
                  _window.MockEventSourceInstance.triggerEvent('error', {});
                }, 500);
              },
              {
                type: 'attachment',
                id: messageId,
                data: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
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

  async unmockApis() {
    if (!shouldMock) {
      return;
    }

    await this.page.unrouteAll();
  }
}
