import {
  addContextCategoryMutation,
  addContextDocMutation,
  addContextFileMutation,
  ContextCategories as GraphQLContextCategories,
  createCopilotContextMutation,
  createCopilotMessageMutation,
  createCopilotSessionMutation,
  forkCopilotSessionMutation,
  getCopilotSessionQuery,
  getTranscriptTaskQuery,
  listContextObjectQuery,
  listContextQuery,
  matchFilesQuery,
  matchWorkspaceDocsQuery,
  removeContextDocMutation,
  removeContextFileMutation,
  settleTranscriptTaskMutation,
  submitTranscriptTaskMutation,
  updateCopilotSessionMutation,
} from '@affine/graphql';

import { ContextCategories } from '../../models';
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
  const res = await app.gql({
    query: createCopilotSessionMutation,
    variables: { options: { workspaceId, docId, promptName, pinned } },
  });

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
  const res = await app.gql({
    query: getCopilotSessionQuery,
    variables: { workspaceId, sessionId },
  });
  const session = res.currentUser?.copilot?.chats?.edges?.[0]?.node;

  if (!session) {
    throw new Error(`Copilot session not found: ${sessionId}`);
  }

  return {
    id: session.sessionId,
    docId: session.docId,
    parentSessionId: session.parentSessionId,
    pinned: session.pinned,
    promptName: session.promptName,
  };
}

export async function updateCopilotSession(
  app: TestingApp,
  sessionId: string,
  promptName: string
): Promise<string> {
  const res = await app.gql({
    query: updateCopilotSessionMutation,
    variables: { options: { sessionId, promptName } },
  });

  return res.updateCopilotSession;
}

export async function forkCopilotSession(
  app: TestingApp,
  workspaceId: string,
  docId: string,
  sessionId: string,
  latestMessageId?: string
): Promise<string> {
  const res = await app.gql({
    query: forkCopilotSessionMutation,
    variables: { options: { workspaceId, docId, sessionId, latestMessageId } },
  });

  return res.forkCopilotSession;
}

export async function createCopilotContext(
  app: TestingApp,
  workspaceId: string,
  sessionId: string
): Promise<string> {
  const res = await app.gql({
    query: createCopilotContextMutation,
    variables: { workspaceId, sessionId },
  });

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
  const res = await app.gql({
    query: matchFilesQuery,
    variables: { contextId, content, limit, threshold: 1 },
  });

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
  const res = await app.gql({
    query: matchWorkspaceDocsQuery,
    variables: { contextId, content, limit, threshold: 1 },
  });

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
  const res = await app.gql({
    query: listContextQuery,
    variables: { workspaceId, sessionId },
  });

  return (res.currentUser?.copilot?.contexts || []).filter(
    (context): context is { id: string; workspaceId: string } => !!context.id
  );
}

export async function addContextFile(
  app: TestingApp,
  contextId: string,
  fileName: string,
  content: Buffer
): Promise<{ id: string }> {
  const res = await app.gql({
    query: addContextFileMutation,
    variables: {
      content: new File([content], fileName, {
        type: 'application/octet-stream',
      }),
      options: { contextId },
    },
  });

  return res.addContextFile;
}

export async function removeContextFile(
  app: TestingApp,
  contextId: string,
  fileId: string
): Promise<boolean> {
  const res = await app.gql({
    query: removeContextFileMutation,
    variables: { options: { contextId, fileId } },
  });

  return res.removeContextFile;
}

export async function addContextDoc(
  app: TestingApp,
  contextId: string,
  docId: string
): Promise<{ id: string }[]> {
  const res = await app.gql({
    query: addContextDocMutation,
    variables: { options: { contextId, docId } },
  });

  return [res.addContextDoc];
}

export async function addContextCategory(
  app: TestingApp,
  contextId: string,
  type: ContextCategories,
  categoryId: string,
  docs: string[]
): Promise<{ type: string; id: string; docs: { id: string }[] }> {
  const graphqlType =
    type === ContextCategories.Collection
      ? GraphQLContextCategories.Collection
      : GraphQLContextCategories.Tag;
  const res = await app.gql({
    query: addContextCategoryMutation,
    variables: { options: { contextId, type: graphqlType, categoryId, docs } },
  });

  return res.addContextCategory;
}

export async function removeContextDoc(
  app: TestingApp,
  contextId: string,
  docId: string
): Promise<boolean> {
  const res = await app.gql({
    query: removeContextDocMutation,
    variables: { options: { contextId, docId } },
  });

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
        status: string | null;
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
  const res = await app.gql({
    query: listContextObjectQuery,
    variables: { workspaceId, sessionId, contextId },
  });

  const context = res.currentUser?.copilot?.contexts?.[0];
  if (!context) {
    return undefined;
  }

  return {
    docs: context.docs,
    files: context.files.map(({ mimeType: _mimeType, ...file }) => file),
  };
}

export async function listContextCategories(
  app: TestingApp,
  workspaceId: string,
  sessionId: string,
  contextId: string
): Promise<
  | {
      collections: {
        type: string;
        id: string;
        docs: {
          id: string;
          status: string | null;
          createdAt: number;
        }[];
      }[];
    }
  | undefined
> {
  const res = await app.gql({
    query: listContextObjectQuery,
    variables: { workspaceId, sessionId, contextId },
  });

  const context = res.currentUser?.copilot?.contexts?.[0];
  if (!context) {
    return undefined;
  }

  return { collections: context.collections };
}

export async function submitTranscriptTask(
  app: TestingApp,
  workspaceId: string,
  blobId: string,
  fileName: string,
  content: Buffer[],
  input?: Record<string, unknown>
): Promise<{ id: string; status: string }> {
  const res = await app.gql({
    query: submitTranscriptTaskMutation,
    variables: {
      blobId,
      workspaceId,
      blobs: content.map(
        buffer => new File([buffer], fileName, { type: 'audio/opus' })
      ),
      input: input ?? null,
    },
  });

  if (!res.submitTranscriptTask) {
    throw new Error('submitTranscriptTask returned null');
  }

  return res.submitTranscriptTask;
}

export async function settleTranscriptTask(
  app: TestingApp,
  workspaceId: string,
  taskId: string
): Promise<{
  id: string;
  status: string;
  title: string | null;
  summary: string | null;
  actions: string | null;
  sourceAudio: {
    blobId: string | null;
    mimeType: string | null;
    durationMs: number | null;
    sampleRate: number | null;
    channels: number | null;
  } | null;
  quality: {
    degraded: boolean | null;
    overflowCount: number | null;
  } | null;
  normalizedTranscript: string | null;
  summaryJson: {
    title: string;
    durationMinutes: number;
    attendees: string[];
    keyPoints: string[];
    actionItems: {
      description: string;
      owner: string | null;
      deadline: string | null;
    }[];
    decisions: string[];
    openQuestions: string[];
    blockers: string[];
  } | null;
  normalizedSegments:
    | {
        speaker: string;
        startSec: number;
        endSec: number;
        start: string;
        end: string;
        text: string;
      }[]
    | null;
  transcription:
    | { speaker: string; start: string; end: string; transcription: string }[]
    | null;
}> {
  const res = await app.gql({
    query: settleTranscriptTaskMutation,
    variables: { workspaceId, taskId },
  });

  if (!res.settleTranscriptTask) {
    throw new Error('settleTranscriptTask returned null');
  }

  return res.settleTranscriptTask;
}

export async function getTranscriptTask(
  app: TestingApp,
  workspaceId: string,
  taskId: string
): Promise<{
  id: string;
  status: string;
  title: string | null;
  summary: string | null;
  sourceAudio: {
    blobId: string | null;
    mimeType: string | null;
    durationMs: number | null;
    sampleRate: number | null;
    channels: number | null;
  } | null;
  quality: {
    degraded: boolean | null;
    overflowCount: number | null;
  } | null;
  normalizedTranscript: string | null;
  summaryJson: {
    title: string;
    durationMinutes: number;
    attendees: string[];
    keyPoints: string[];
    actionItems: {
      description: string;
      owner: string | null;
      deadline: string | null;
    }[];
    decisions: string[];
    openQuestions: string[];
    blockers: string[];
  } | null;
  normalizedSegments:
    | {
        speaker: string;
        startSec: number;
        endSec: number;
        start: string;
        end: string;
        text: string;
      }[]
    | null;
  transcription:
    | {
        speaker: string;
        start: string;
        end: string;
        transcription: string;
      }[]
    | null;
}> {
  const res = await app.gql({
    query: getTranscriptTaskQuery,
    variables: { workspaceId, taskId },
  });

  const transcription = res.currentUser?.copilot?.transcriptTask;
  if (!transcription) {
    throw new Error('transcriptTask returned null');
  }

  return transcription;
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
    query: createCopilotMessageMutation.query,
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

  let resp = app.POST('/graphql').set({
    'x-request-id': 'test',
    'x-operation-name': createCopilotMessageMutation.op,
  });

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
          Array.from({ length: blobs.length }).reduce<Record<string, string[]>>(
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
  return res.body.data.createCopilotMessage;
}

export async function chatWithText(
  app: TestingApp,
  sessionId: string,
  messageId?: string,
  prefix = '',
  retry?: boolean
): Promise<string> {
  const endpoint = prefix || '/stream';
  const query = messageId
    ? `?messageId=${messageId}` + (retry ? '&retry=true' : '')
    : '';
  const res = await app
    .GET(`/api/copilot/chat/${sessionId}${endpoint}${query}`)
    .expect(200);

  if (prefix) {
    return res.text;
  }

  const events = sse2array(res.text);
  const errorEvent = events.find(event => event.event === 'error');
  if (errorEvent?.data) {
    let message = errorEvent.data;
    try {
      const parsed = JSON.parse(errorEvent.data);
      message = parsed.message || message;
    } catch {
      // noop: keep raw error data
    }
    throw new Error(message);
  }

  return events
    .filter(event => event.event === 'message')
    .map(event => event.data ?? '')
    .join('');
}

export async function chatWithTextStream(
  app: TestingApp,
  sessionId: string,
  messageId?: string
) {
  return chatWithText(app, sessionId, messageId, '/stream');
}

export async function chatWithActionStream(
  app: TestingApp,
  sessionId: string,
  input: {
    actionId: string;
    actionVersion?: string;
    modelId?: string;
    messageId?: string;
  }
) {
  const query = new URLSearchParams({
    actionId: input.actionId,
    actionVersion: input.actionVersion ?? 'v1',
  });
  if (input.modelId) {
    query.set('modelId', input.modelId);
  }
  if (input.messageId) {
    query.set('messageId', input.messageId);
  }
  const res = await app
    .GET(`/api/copilot/actions/${sessionId}/stream?${query}`)
    .expect(200);

  return res.text;
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
  withPrompt?: boolean;
  withMessages?: boolean;
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

export const TestAssets = {
  SSOT: `In [information science](https://en.wikipedia.org/wiki/Information_science) and [information technology](https://en.wikipedia.org/wiki/Information_technology), **single source of truth** (**SSOT**) architecture, or **single point of truth** (**SPOT**) architecture, for [information systems](https://en.wikipedia.org/wiki/Information_system) is the practice of structuring [information models](https://en.wikipedia.org/wiki/Information_model) and associated [data schemas](https://en.wikipedia.org/wiki/Database_schema) such that every [data element](https://en.wikipedia.org/wiki/Data_element) is [mastered](https://en.wikipedia.org/wiki/Golden_record_(informatics)) (or edited) in only one place, providing [data normalization to a canonical form](https://en.wikipedia.org/wiki/Canonical_form#Computing) (for example, in [database normalization](https://en.wikipedia.org/wiki/Database_normalization) or content [transclusion](https://en.wikipedia.org/wiki/Transclusion)).\n\nThere are several scenarios with respect to copies and updates:\n\n* The master data is never copied and instead only references to it are made; this means that all reads and updates go directly to the SSOT.\n* The master data is copied but the copies are only read and only the master data is updated; if requests to read data are only made on copies, this is an instance of [CQRS](https://en.wikipedia.org/wiki/CQRS).\n* The master data is copied and the copies are updated; this needs a reconciliation mechanism when there are concurrent updates.\n  * Updates on copies can be thrown out whenever a concurrent update is made on the master, so they are not considered fully committed until propagated to the master. (many blockchains work that way.)\n  * Concurrent updates are merged. (if an automatic merge fails, it could fall back on another strategy, which could be the previous strategy or something else like manual intervention, which most source version control systems do.)\n\nThe advantages of SSOT architectures include easier prevention of mistaken inconsistencies (such as a duplicate value/copy somewhere being forgotten), and greatly simplified [version control](https://en.wikipedia.org/wiki/Version_control). Without a SSOT, dealing with inconsistencies implies either complex and error-prone consensus algorithms, or using a simpler architecture that's liable to lose data in the face of inconsistency (the latter may seem unacceptable but it is sometimes a very good choice; it is how most blockchains operate: a transaction is actually final only if it was included in the next block that is mined).\n\nIdeally, SSOT systems provide data that are authentic (and [authenticatable](https://en.wikipedia.org/wiki/Authentication)), relevant, and [referable](https://en.wikipedia.org/wiki/Reference_(computer_science)).[[1]](https://en.wikipedia.org/wiki/Single_source_of_truth#cite_note-1)\n\nDeployment of an SSOT architecture is becoming increasingly important in enterprise settings where incorrectly linked duplicate or de-normalized data elements (a direct consequence of intentional or unintentional [denormalization](https://en.wikipedia.org/wiki/Denormalization) of any explicit data model) pose a risk for retrieval of outdated, and therefore incorrect, information. Common examples (i.e., example classes of implementation) are as follows:\n\n* In [electronic health records](https://en.wikipedia.org/wiki/Electronic_health_record) (EHRs), it is imperative to accurately validate patient identity against a single referential repository, which serves as the SSOT. Duplicate representations of data within the enterprise would be implemented by the use of [pointers](https://en.wikipedia.org/wiki/Pointer_(computer_programming)) rather than duplicate database tables, rows, or cells. This ensures that data updates to elements in the authoritative location are comprehensively distributed to all [federated database](https://en.wikipedia.org/wiki/Federated_database) constituencies in the larger overall [enterprise architecture](https://en.wikipedia.org/wiki/Enterprise_architecture). EHRs are an excellent class for exemplifying how SSOT architecture is both poignantly necessary and challenging to achieve: it is challenging because inter-organization [health information exchange](https://en.wikipedia.org/wiki/Health_information_exchange) is inherently a [cybersecurity](https://en.wikipedia.org/wiki/Computer_security) competence hurdle, and nonetheless it is necessary, to prevent [medical errors](https://en.wikipedia.org/wiki/Medical_error), to prevent the wasted costs of inefficiency (such as duplicated work or rework), and to make the [primary care](https://en.wikipedia.org/wiki/Primary_care) and [medical home](https://en.wikipedia.org/wiki/Medical_home) concepts feasible (to achieve competent [care transitions](https://en.wikipedia.org/wiki/Transitional_care)).\n* [Single-source publishing](https://en.wikipedia.org/wiki/Single-source_publishing) as a general principle or ideal in [content management](https://en.wikipedia.org/wiki/Content_management) relies on having SSOTs, via [transclusion](https://en.wikipedia.org/wiki/Transclusion) or (otherwise, at least) substitution. Substitution happens via [libraries of objects](https://en.wikipedia.org/wiki/Library_(computing)#Object_libraries) that can be propagated as static copies which are later refreshed when necessary (that is, when refreshing of the [copy-paste](https://en.wikipedia.org/wiki/Cut,_copy,_and_paste) or [import](https://en.wikipedia.org/wiki/Import_and_export_of_data) is triggered by a larger updating event). [Component content management systems](https://en.wikipedia.org/wiki/Component_content_management_system) are a class of [content management systems](https://en.wikipedia.org/wiki/Content_management_system) that aim to provide competence on this level.`,
  Code: `fn euclidean_distance(a: &Vec<f64>, b: &Vec<f64>) -> f64 {\na.iter().zip(b.iter()).map(|(x, y)| (*x - *y).powi(2)).sum::<f64>().sqrt()\n}`,
  TODO: 'The PDF exporting feature in edgeless is flawed, which is not supposed to support rendering content with infinite logical size. We should remove this feature entry to user, but the current "export blob in surface ref" feature should be migrated and kept (which is base on the edgelessToCanvas API, which makes sense for exporting a partial viewport area for the page)',
  AFFiNE:
    'AFFiNE is a workspace with fully merged docs, whiteboards and databases.Get more things done, your creativity isn’t monotone.',
};
