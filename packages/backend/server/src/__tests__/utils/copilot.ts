import { PromptConfig, PromptMessage } from '../../plugins/copilot/providers';
import { NodeExecutorType } from '../../plugins/copilot/workflow/executor';
import {
  WorkflowGraph,
  WorkflowNodeType,
  WorkflowParams,
} from '../../plugins/copilot/workflow/types';
import { TestingApp } from './testing-app';

export const cleanObject = (
  obj: any[] | undefined,
  condition = ['id', 'status', 'error', 'sessionId', 'createdAt']
) =>
  JSON.parse(
    JSON.stringify(obj || [], (k, v) =>
      condition.includes(k) || v === null ? undefined : v
    )
  );

export async function createCopilotSession(
  app: TestingApp,
  workspaceId: string,
  docId: string | null,
  promptName: string,
  pinned: boolean = false
): Promise<string> {
  const res = await app.gql(
    `
    mutation createCopilotSession($options: CreateChatSessionInput!) {
      createCopilotSession(options: $options)
    }
  `,
    { options: { workspaceId, docId, promptName, pinned } }
  );

  return res.createCopilotSession;
}

export async function createWorkspaceCopilotSession(
  app: TestingApp,
  workspaceId: string,
  promptName: string
): Promise<string> {
  return createCopilotSession(app, workspaceId, null, promptName);
}

export async function createPinnedCopilotSession(
  app: TestingApp,
  workspaceId: string,
  docId: string,
  promptName: string
): Promise<string> {
  return createCopilotSession(app, workspaceId, docId, promptName, true);
}

export async function createDocCopilotSession(
  app: TestingApp,
  workspaceId: string,
  docId: string,
  promptName: string
): Promise<string> {
  return createCopilotSession(app, workspaceId, docId, promptName);
}

export async function getCopilotSession(
  app: TestingApp,
  workspaceId: string,
  sessionId: string
): Promise<{
  id: string;
  docId: string | null;
  parentSessionId: string | null;
  pinned: boolean;
  promptName: string;
}> {
  const res = await app.gql(
    `
      query getCopilotSession(
        $workspaceId: String!
        $sessionId: String!
      ) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            session(sessionId: $sessionId) {
              id
              docId
              parentSessionId
              pinned
              promptName
            }
          }
        }
      }`,
    { workspaceId, sessionId }
  );

  return res.currentUser?.copilot?.session;
}

export async function updateCopilotSession(
  app: TestingApp,
  sessionId: string,
  promptName: string
): Promise<string> {
  const res = await app.gql(
    `
    mutation updateCopilotSession($options: UpdateChatSessionInput!) {
      updateCopilotSession(options: $options)
    }
  `,
    { options: { sessionId, promptName } }
  );

  return res.updateCopilotSession;
}

export async function forkCopilotSession(
  app: TestingApp,
  workspaceId: string,
  docId: string,
  sessionId: string,
  latestMessageId?: string
): Promise<string> {
  const res = await app.gql(
    `
    mutation forkCopilotSession($options: ForkChatSessionInput!) {
      forkCopilotSession(options: $options)
    }
  `,
    { options: { workspaceId, docId, sessionId, latestMessageId } }
  );

  return res.forkCopilotSession;
}

export async function createCopilotContext(
  app: TestingApp,
  workspaceId: string,
  sessionId: string
): Promise<string> {
  const res = await app.gql(`
        mutation {
          createCopilotContext(workspaceId: "${workspaceId}", sessionId: "${sessionId}")
        }
      `);

  return res.createCopilotContext;
}

export async function matchFiles(
  app: TestingApp,
  contextId: string,
  content: string,
  limit: number
): Promise<
  | {
      fileId: string;
      chunk: number;
      content: string;
      distance: number | null;
    }[]
  | undefined
> {
  const res = await app.gql(
    `
        query matchFiles($contextId: String!, $content: String!, $limit: SafeInt, $threshold: Float) {
          currentUser {
            copilot {
              contexts(contextId: $contextId) {
                matchFiles(content: $content, limit: $limit, threshold: $threshold) {
                  fileId
                  chunk
                  content
                  distance
                }
              }
            }
          }
        }
      `,
    { contextId, content, limit, threshold: 1 }
  );

  return res.currentUser?.copilot?.contexts?.[0]?.matchFiles;
}

export async function matchWorkspaceDocs(
  app: TestingApp,
  contextId: string,
  content: string,
  limit: number
): Promise<
  | {
      docId: string;
      chunk: number;
      content: string;
      distance: number | null;
    }[]
  | undefined
> {
  const res = await app.gql(
    `
      query matchWorkspaceDocs($contextId: String!, $content: String!, $limit: SafeInt, $threshold: Float) {
        currentUser {
          copilot {
            contexts(contextId: $contextId) {
              matchWorkspaceDocs(content: $content, limit: $limit, threshold: $threshold) {
                docId
                chunk
                content
                distance
              }
            }
          }
        }
      }
      `,
    { contextId, content, limit, threshold: 1 }
  );

  return res.currentUser?.copilot?.contexts?.[0]?.matchWorkspaceDocs;
}

export async function listContext(
  app: TestingApp,
  workspaceId: string,
  sessionId: string
): Promise<
  {
    id: string;
    workspaceId: string;
  }[]
> {
  const res = await app.gql(`
        query {
          currentUser {
            copilot(workspaceId: "${workspaceId}") {
              contexts(sessionId: "${sessionId}") {
                id
                workspaceId
              }
            }
          }
        }
      `);

  return res.currentUser?.copilot?.contexts;
}

export async function addContextFile(
  app: TestingApp,
  contextId: string,
  blobId: string,
  fileName: string,
  content: Buffer
): Promise<{ id: string }> {
  const res = await app
    .POST('/graphql')
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .field(
      'operations',
      JSON.stringify({
        query: `
          mutation addContextFile($options: AddContextFileInput!, $content: Upload!) {
            addContextFile(content: $content, options: $options) {
              id
            }
          }
        `,
        variables: {
          content: null,
          options: { contextId, blobId },
        },
      })
    )
    .field('map', JSON.stringify({ '0': ['variables.content'] }))
    .attach('0', content, {
      filename: fileName,
      contentType: 'application/octet-stream',
    })
    .expect(200);

  return res.body.data.addContextFile;
}

export async function removeContextFile(
  app: TestingApp,
  contextId: string,
  fileId: string
): Promise<string> {
  const res = await app.gql(
    `
        mutation removeContextFile($options: RemoveContextFileInput!) {
          removeContextFile(options: $options)
        }
    `,
    { options: { contextId, fileId } }
  );

  return res.removeContextFile;
}

export async function addContextDoc(
  app: TestingApp,
  contextId: string,
  docId: string
): Promise<{ id: string }[]> {
  const res = await app.gql(
    `
          mutation addContextDoc($options: AddContextDocInput!) {
            addContextDoc(options: $options) {
              id
            }
          }
        `,
    { options: { contextId, docId } }
  );

  return res.addContextDoc;
}

export async function removeContextDoc(
  app: TestingApp,
  contextId: string,
  docId: string
): Promise<string> {
  const res = await app.gql(
    `
      mutation removeContextDoc($options: RemoveContextFileInput!) {
        removeContextDoc(options: $options)
      }
    `,
    { options: { contextId, docId } }
  );

  return res.removeContextDoc;
}

export async function listContextDocAndFiles(
  app: TestingApp,
  workspaceId: string,
  sessionId: string,
  contextId: string
): Promise<
  | {
      docs: {
        id: string;
        status: string;
        error: string | null;
        createdAt: number;
      }[];
      files: {
        id: string;
        name: string;
        blobId: string;
        chunkSize: number;
        status: string;
        error: string | null;
        createdAt: number;
      }[];
    }
  | undefined
> {
  const res = await app.gql(`
        query {
          currentUser {
            copilot(workspaceId: "${workspaceId}") {
              contexts(sessionId: "${sessionId}", contextId: "${contextId}") {
                docs {
                  id
                  status
                  createdAt
                }
                files {
                  id
                  name
                  blobId
                  chunkSize
                  status
                  error
                  createdAt
                }
              }
            }
          }
        }
      `);

  const { docs, files } = res.currentUser?.copilot?.contexts?.[0] || {};

  return { docs, files };
}

export async function submitAudioTranscription(
  app: TestingApp,
  workspaceId: string,
  blobId: string,
  fileName: string,
  content: Buffer[]
): Promise<{ id: string; status: string }> {
  let resp = app
    .POST('/graphql')
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .field(
      'operations',
      JSON.stringify({
        query: `
          mutation submitAudioTranscription($blob: Upload, $blobs: [Upload!], $blobId: String!, $workspaceId: String!) {
            submitAudioTranscription(blob: $blob, blobs: $blobs, blobId: $blobId, workspaceId: $workspaceId) {
              id
              status
            }
          }
        `,
        variables: {
          blob: null,
          blobs: [],
          blobId,
          workspaceId,
        },
      })
    )
    .field(
      'map',
      JSON.stringify(
        Array.from<any>({ length: content.length }).reduce((acc, _, idx) => {
          acc[idx.toString()] = [`variables.blobs.${idx}`];
          return acc;
        }, {})
      )
    );
  for (const [idx, buffer] of content.entries()) {
    resp = resp.attach(idx.toString(), buffer, {
      filename: fileName,
      contentType: 'audio/opus',
    });
  }

  const res = await resp.expect(200);

  return res.body.data.submitAudioTranscription;
}

export async function retryAudioTranscription(
  app: TestingApp,
  workspaceId: string,
  jobId: string
): Promise<{ id: string; status: string }> {
  const res = await app.gql(
    `
      mutation retryAudioTranscription($workspaceId: String!, $jobId: String!) {
        retryAudioTranscription(workspaceId: $workspaceId, jobId: $jobId) {
          id
          status
        }
      }
    `,
    { workspaceId, jobId }
  );

  return res.retryAudioTranscription;
}

export async function claimAudioTranscription(
  app: TestingApp,
  jobId: string
): Promise<{
  id: string;
  status: string;
  title: string | null;
  summary: string | null;
  actions: string | null;
  transcription:
    | {
        speaker: string;
        start: number;
        end: number;
        transcription: string;
      }[]
    | null;
}> {
  const res = await app.gql(
    `
      mutation claimAudioTranscription($jobId: String!) {
        claimAudioTranscription(jobId: $jobId) {
          id
          status
          title
          summary
          actions
          transcription {
            speaker
            start
            end
            transcription
          }
        }
      }
    `,
    { jobId }
  );

  return res.claimAudioTranscription;
}

export async function audioTranscription(
  app: TestingApp,
  workspaceId: string,
  jobId: string
): Promise<{
  id: string;
  status: string;
  title: string | null;
  summary: string | null;
  transcription:
    | {
        speaker: string;
        start: number;
        end: number;
        transcription: string;
      }[]
    | null;
}> {
  const res = await app.gql(
    `
      query audioTranscription($workspaceId: String!, $jobId: String!) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            audioTranscription(jobId: $jobId) {
              id
              status
              title
              summary
              transcription {
                speaker
                start
                end
                transcription
              }
            }
          }
        }
      }
    `,
    { workspaceId, jobId }
  );

  return res.currentUser?.copilot?.audioTranscription;
}

export async function createCopilotMessage(
  app: TestingApp,
  sessionId: string,
  content?: string,
  attachments?: string[],
  blob?: File,
  blobs?: File[],
  params?: Record<string, string>
): Promise<string> {
  const gql = {
    query: `
          mutation createCopilotMessage($options: CreateChatMessageInput!) {
            createCopilotMessage(options: $options)
          }
        `,
    variables: {
      options: {
        sessionId,
        content,
        attachments,
        blob: null,
        blobs: [],
        params,
      },
    },
  };

  let resp = app
    .POST('/graphql')
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' });
  if (blob || blobs) {
    resp = resp.field('operations', JSON.stringify(gql));

    if (blob) {
      resp = resp.field(
        'map',
        JSON.stringify({ '0': ['variables.options.blob'] })
      );
      resp = resp.attach('0', Buffer.from(await blob.arrayBuffer()), {
        filename: blob.name || 'file',
        contentType: blob.type || 'application/octet-stream',
      });
    } else if (blobs && blobs.length) {
      resp = resp.field(
        'map',
        JSON.stringify(
          Array.from<any>({ length: blobs?.length ?? 0 }).reduce(
            (acc, _, idx) => {
              acc[idx.toString()] = [`variables.options.blobs.${idx}`];
              return acc;
            },
            {}
          )
        )
      );
      for (const [idx, file] of blobs.entries()) {
        resp = resp.attach(
          idx.toString(),
          Buffer.from(await file.arrayBuffer()),
          {
            filename: file.name || `file${idx}`,
            contentType: file.type || 'application/octet-stream',
          }
        );
      }
    }
  } else {
    resp = resp.send(gql);
  }

  const res = await resp.expect(200);
  console.log('createCopilotMessage', res.body);
  return res.body.data.createCopilotMessage;
}

export async function chatWithText(
  app: TestingApp,
  sessionId: string,
  messageId?: string,
  prefix = '',
  retry?: boolean
): Promise<string> {
  const query = messageId
    ? `?messageId=${messageId}` + (retry ? '&retry=true' : '')
    : '';
  const res = await app
    .GET(`/api/copilot/chat/${sessionId}${prefix}${query}`)
    .expect(200);

  return res.text;
}

export async function chatWithTextStream(
  app: TestingApp,
  sessionId: string,
  messageId?: string
) {
  return chatWithText(app, sessionId, messageId, '/stream');
}

export async function chatWithWorkflow(
  app: TestingApp,
  sessionId: string,
  messageId?: string
) {
  return chatWithText(app, sessionId, messageId, '/workflow');
}

export async function chatWithImages(
  app: TestingApp,
  sessionId: string,
  messageId?: string
) {
  return chatWithText(app, sessionId, messageId, '/images');
}

export async function chatWithStreamObject(
  app: TestingApp,
  sessionId: string,
  messageId?: string
) {
  return chatWithText(app, sessionId, messageId, '/stream-object');
}

export async function unsplashSearch(
  app: TestingApp,
  params: Record<string, string> = {}
) {
  const query = new URLSearchParams(params);
  const res = await app.GET(`/api/copilot/unsplash/photos?${query}`);
  return res;
}

export function sse2array(eventSource: string) {
  const blocks = eventSource.replace(/^\n(.*?)\n$/, '$1').split(/\n\n+/);
  return blocks.map(block =>
    block.split('\n').reduce(
      (prev, curr) => {
        const [key, ...values] = curr.split(': ');
        return Object.assign(prev, { [key]: values.join(': ') });
      },
      {} as Record<string, string>
    )
  );
}

export function array2sse(blocks: Record<string, string>[]) {
  return blocks
    .map(
      e =>
        '\n' +
        Object.entries(e)
          .filter(([k]) => !!k)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
    )
    .join('\n');
}

export function textToEventStream(
  content: string | string[],
  id: string,
  event = 'message'
): string {
  return (
    Array.from(content)
      .map(x => `\nevent: ${event}\nid: ${id}\ndata: ${x}`)
      .join('\n') + '\n\n'
  );
}

type ChatMessage = {
  id?: string;
  role: string;
  content: string;
  attachments: string[] | null;
  createdAt: string;
};

type History = {
  sessionId: string;
  pinned: boolean;
  tokens: number;
  action: string | null;
  createdAt: string;
  messages: ChatMessage[];
};

type HistoryOptions = {
  action?: boolean;
  fork?: boolean;
  pinned?: boolean;
  limit?: number;
  skip?: number;
  sessionOrder?: 'asc' | 'desc';
  messageOrder?: 'asc' | 'desc';
  sessionId?: string;
};

export async function getHistories(
  app: TestingApp,
  variables: {
    workspaceId: string;
    docId?: string | null;
    options?: HistoryOptions;
  }
): Promise<History[]> {
  const res = await app.gql(
    `
    query getCopilotHistories(
      $workspaceId: String!
      $docId: String
      $options: QueryChatHistoriesInput
    ) {
      currentUser {
        copilot(workspaceId: $workspaceId) {
          histories(docId: $docId, options: $options) {
            sessionId
            pinned
            tokens
            action
            createdAt
            messages {
              id
              role
              content
              attachments
              createdAt
            }
          }
        }
      }
    }
    `,
    variables
  );

  return res.currentUser?.copilot?.histories || [];
}

export async function getWorkspaceSessions(
  app: TestingApp,
  variables: {
    workspaceId: string;
    options?: HistoryOptions;
  }
): Promise<History[]> {
  const res = await app.gql(
    `query getCopilotWorkspaceSessions(
        $workspaceId: String!
        $options: QueryChatHistoriesInput
      ) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            histories(docId: null, options: $options) {
              sessionId
              pinned
              tokens
              action
              createdAt
              messages {
                id
                role
                content
                streamObjects {
                  type
                  textDelta
                  toolCallId
                  toolName
                  args
                  result
                }
                attachments
                createdAt
              }
            }
          }
        }
      }`,
    variables
  );

  return res.currentUser?.copilot?.histories || [];
}

export async function getDocSessions(
  app: TestingApp,
  variables: {
    workspaceId: string;
    docId: string;
    options?: HistoryOptions;
  }
): Promise<History[]> {
  const res = await app.gql(
    `query getCopilotDocSessions(
        $workspaceId: String!
        $docId: String!
        $options: QueryChatHistoriesInput
      ) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            histories(docId: $docId, options: $options) {
              sessionId
              pinned
              tokens
              action
              createdAt
              messages {
                id
                role
                content
                streamObjects {
                  type
                  textDelta
                  toolCallId
                  toolName
                  args
                  result
                }
                attachments
                createdAt
              }
            }
          }
        }
      }`,
    variables
  );

  return res.currentUser?.copilot?.histories || [];
}

export async function getPinnedSessions(
  app: TestingApp,
  variables: {
    workspaceId: string;
    docId?: string;
    messageOrder?: 'asc' | 'desc';
    withPrompt?: boolean;
  }
): Promise<History[]> {
  const res = await app.gql(
    `query getCopilotPinnedSessions(
        $workspaceId: String!
        $docId: String
        $messageOrder: ChatHistoryOrder
        $withPrompt: Boolean
      ) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            histories(docId: $docId, options: {
              limit: 1,
              pinned: true,
              messageOrder: $messageOrder,
              withPrompt: $withPrompt
            }) {
              sessionId
              pinned
              tokens
              action
              createdAt
              messages {
                id
                role
                content
                streamObjects {
                  type
                  textDelta
                  toolCallId
                  toolName
                  args
                  result
                }
                attachments
                createdAt
              }
            }
          }
        }
      }`,
    variables
  );

  return res.currentUser?.copilot?.histories || [];
}

type Prompt = {
  name: string;
  model: string;
  messages: PromptMessage[];
  config?: PromptConfig;
};
type WorkflowTestCase = {
  graph: WorkflowGraph;
  prompts: Prompt[];
  callCount: number[];
  input: string[];
  params: WorkflowParams[];
  result: (string | undefined)[];
};

export const WorkflowTestCases: WorkflowTestCase[] = [
  {
    prompts: [
      {
        name: 'test1',
        model: 'test',
        messages: [{ role: 'user', content: '{{content}}' }],
      },
    ],
    graph: {
      name: 'test chat text node',
      graph: [
        {
          id: 'start',
          name: 'test chat text node',
          nodeType: WorkflowNodeType.Basic,
          type: NodeExecutorType.ChatText,
          promptName: 'test1',
          edges: [],
        },
      ],
    },
    callCount: [1],
    input: ['test'],
    params: [],
    result: ['generate text to text stream'],
  },
  {
    prompts: [],
    graph: {
      name: 'test check json node',
      graph: [
        {
          id: 'start',
          name: 'basic node',
          nodeType: WorkflowNodeType.Basic,
          type: NodeExecutorType.CheckJson,
          edges: [],
        },
      ],
    },
    callCount: [1, 1],
    input: ['{"test": "true"}', '{"test": '],
    params: [],
    result: ['true', 'false'],
  },
  {
    prompts: [],
    graph: {
      name: 'test check html node',
      graph: [
        {
          id: 'start',
          name: 'basic node',
          nodeType: WorkflowNodeType.Basic,
          type: NodeExecutorType.CheckHtml,
          edges: [],
        },
      ],
    },
    callCount: [1, 1, 1, 1],
    params: [{}, { strict: 'true' }, {}, {}],
    input: [
      '<html><span /></html>',
      '<html><span /></html>',
      '<img src="http://123.com/1.jpg" />',
      '{"test": "true"}',
    ],
    result: ['true', 'false', 'true', 'false'],
  },
  {
    prompts: [],
    graph: {
      name: 'test nope node',
      graph: [
        {
          id: 'start',
          name: 'nope node',
          nodeType: WorkflowNodeType.Nope,
          edges: [],
        },
      ],
    },
    callCount: [1],
    input: ['test'],
    params: [],
    result: ['test'],
  },
];

export const TestAssets = {
  SSOT: `In [information science](https://en.wikipedia.org/wiki/Information_science) and [information technology](https://en.wikipedia.org/wiki/Information_technology), **single source of truth** (**SSOT**) architecture, or **single point of truth** (**SPOT**) architecture, for [information systems](https://en.wikipedia.org/wiki/Information_system) is the practice of structuring [information models](https://en.wikipedia.org/wiki/Information_model) and associated [data schemas](https://en.wikipedia.org/wiki/Database_schema) such that every [data element](https://en.wikipedia.org/wiki/Data_element) is [mastered](https://en.wikipedia.org/wiki/Golden_record_(informatics)) (or edited) in only one place, providing [data normalization to a canonical form](https://en.wikipedia.org/wiki/Canonical_form#Computing) (for example, in [database normalization](https://en.wikipedia.org/wiki/Database_normalization) or content [transclusion](https://en.wikipedia.org/wiki/Transclusion)).\n\nThere are several scenarios with respect to copies and updates:\n\n* The master data is never copied and instead only references to it are made; this means that all reads and updates go directly to the SSOT.\n* The master data is copied but the copies are only read and only the master data is updated; if requests to read data are only made on copies, this is an instance of [CQRS](https://en.wikipedia.org/wiki/CQRS).\n* The master data is copied and the copies are updated; this needs a reconciliation mechanism when there are concurrent updates.\n  * Updates on copies can be thrown out whenever a concurrent update is made on the master, so they are not considered fully committed until propagated to the master. (many blockchains work that way.)\n  * Concurrent updates are merged. (if an automatic merge fails, it could fall back on another strategy, which could be the previous strategy or something else like manual intervention, which most source version control systems do.)\n\nThe advantages of SSOT architectures include easier prevention of mistaken inconsistencies (such as a duplicate value/copy somewhere being forgotten), and greatly simplified [version control](https://en.wikipedia.org/wiki/Version_control). Without a SSOT, dealing with inconsistencies implies either complex and error-prone consensus algorithms, or using a simpler architecture that's liable to lose data in the face of inconsistency (the latter may seem unacceptable but it is sometimes a very good choice; it is how most blockchains operate: a transaction is actually final only if it was included in the next block that is mined).\n\nIdeally, SSOT systems provide data that are authentic (and [authenticatable](https://en.wikipedia.org/wiki/Authentication)), relevant, and [referable](https://en.wikipedia.org/wiki/Reference_(computer_science)).[[1]](https://en.wikipedia.org/wiki/Single_source_of_truth#cite_note-1)\n\nDeployment of an SSOT architecture is becoming increasingly important in enterprise settings where incorrectly linked duplicate or de-normalized data elements (a direct consequence of intentional or unintentional [denormalization](https://en.wikipedia.org/wiki/Denormalization) of any explicit data model) pose a risk for retrieval of outdated, and therefore incorrect, information. Common examples (i.e., example classes of implementation) are as follows:\n\n* In [electronic health records](https://en.wikipedia.org/wiki/Electronic_health_record) (EHRs), it is imperative to accurately validate patient identity against a single referential repository, which serves as the SSOT. Duplicate representations of data within the enterprise would be implemented by the use of [pointers](https://en.wikipedia.org/wiki/Pointer_(computer_programming)) rather than duplicate database tables, rows, or cells. This ensures that data updates to elements in the authoritative location are comprehensively distributed to all [federated database](https://en.wikipedia.org/wiki/Federated_database) constituencies in the larger overall [enterprise architecture](https://en.wikipedia.org/wiki/Enterprise_architecture). EHRs are an excellent class for exemplifying how SSOT architecture is both poignantly necessary and challenging to achieve: it is challenging because inter-organization [health information exchange](https://en.wikipedia.org/wiki/Health_information_exchange) is inherently a [cybersecurity](https://en.wikipedia.org/wiki/Computer_security) competence hurdle, and nonetheless it is necessary, to prevent [medical errors](https://en.wikipedia.org/wiki/Medical_error), to prevent the wasted costs of inefficiency (such as duplicated work or rework), and to make the [primary care](https://en.wikipedia.org/wiki/Primary_care) and [medical home](https://en.wikipedia.org/wiki/Medical_home) concepts feasible (to achieve competent [care transitions](https://en.wikipedia.org/wiki/Transitional_care)).\n* [Single-source publishing](https://en.wikipedia.org/wiki/Single-source_publishing) as a general principle or ideal in [content management](https://en.wikipedia.org/wiki/Content_management) relies on having SSOTs, via [transclusion](https://en.wikipedia.org/wiki/Transclusion) or (otherwise, at least) substitution. Substitution happens via [libraries of objects](https://en.wikipedia.org/wiki/Library_(computing)#Object_libraries) that can be propagated as static copies which are later refreshed when necessary (that is, when refreshing of the [copy-paste](https://en.wikipedia.org/wiki/Cut,_copy,_and_paste) or [import](https://en.wikipedia.org/wiki/Import_and_export_of_data) is triggered by a larger updating event). [Component content management systems](https://en.wikipedia.org/wiki/Component_content_management_system) are a class of [content management systems](https://en.wikipedia.org/wiki/Content_management_system) that aim to provide competence on this level.`,
  Code: `fn euclidean_distance(a: &Vec<f64>, b: &Vec<f64>) -> f64 {\na.iter().zip(b.iter()).map(|(x, y)| (*x - *y).powi(2)).sum::<f64>().sqrt()\n}`,
  TODO: 'The PDF exporting feature in edgeless is flawed, which is not supposed to support rendering content with infinite logical size. We should remove this feature entry to user, but the current "export blob in surface ref" feature should be migrated and kept (which is base on the edgelessToCanvas API, which makes sense for exporting a partial viewport area for the page)',
  AFFiNE:
    'AFFiNE is a workspace with fully merged docs, whiteboards and databases.Get more things done, your creativity isn’t monotone.',
};
