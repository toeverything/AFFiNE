import {
  Args,
  Context,
  Field,
  Float,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Parent,
  Query,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { Request } from 'express';
import { SafeIntResolver } from 'graphql-scalars';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import {
  BlobQuotaExceeded,
  CallMetric,
  CopilotEmbeddingUnavailable,
  CopilotFailedToMatchContext,
  CopilotFailedToMatchGlobalContext,
  CopilotFailedToModifyContext,
  CopilotSessionNotFound,
  EventBus,
  type FileUpload,
  RequestMutex,
  Throttle,
  TooManyRequest,
  UserFriendlyError,
} from '../../../base';
import { CurrentUser } from '../../../core/auth';
import { AccessController } from '../../../core/permission';
import {
  ContextCategories,
  ContextCategory,
  ContextDoc,
  ContextEmbedStatus,
  ContextFile,
  DocChunkSimilarity,
  FileChunkSimilarity,
  Models,
} from '../../../models';
import { CopilotEmbeddingJob } from '../embedding';
import { COPILOT_LOCKER, CopilotType } from '../resolver';
import { ChatSessionService } from '../session';
import { CopilotStorage } from '../storage';
import { MAX_EMBEDDABLE_SIZE } from '../types';
import { readStream } from '../utils';
import { CopilotContextService } from './service';

@InputType()
class AddContextCategoryInput {
  @Field(() => String)
  contextId!: string;

  @Field(() => ContextCategories)
  type!: ContextCategories;

  @Field(() => String)
  categoryId!: string;

  @Field(() => [String], { nullable: true })
  docs!: string[] | null;
}

@InputType()
class RemoveContextCategoryInput {
  @Field(() => String)
  contextId!: string;

  @Field(() => ContextCategories)
  type!: ContextCategories;

  @Field(() => String)
  categoryId!: string;
}

@InputType()
class AddContextDocInput {
  @Field(() => String)
  contextId!: string;

  @Field(() => String)
  docId!: string;
}

@InputType()
class RemoveContextDocInput {
  @Field(() => String)
  contextId!: string;

  @Field(() => String)
  docId!: string;
}

@InputType()
class AddContextFileInput {
  @Field(() => String)
  contextId!: string;

  @Field(() => String)
  blobId!: string;
}

@InputType()
class RemoveContextFileInput {
  @Field(() => String)
  contextId!: string;

  @Field(() => String)
  fileId!: string;
}

@ObjectType('CopilotContext')
export class CopilotContextType {
  @Field(() => ID, { nullable: true })
  id!: string | undefined;

  @Field(() => String)
  workspaceId!: string;
}

registerEnumType(ContextCategories, { name: 'ContextCategories' });

@ObjectType()
class CopilotDocType implements Omit<ContextDoc, 'status'> {
  @Field(() => ID)
  id!: string;

  @Field(() => ContextEmbedStatus, { nullable: true })
  status!: ContextEmbedStatus | null;

  @Field(() => SafeIntResolver)
  createdAt!: number;
}

@ObjectType()
class CopilotContextCategory implements Omit<ContextCategory, 'docs'> {
  @Field(() => ID)
  id!: string;

  @Field(() => ContextCategories)
  type!: ContextCategories;

  @Field(() => [CopilotDocType])
  docs!: CopilotDocType[];

  @Field(() => SafeIntResolver)
  createdAt!: number;
}

registerEnumType(ContextEmbedStatus, { name: 'ContextEmbedStatus' });

@ObjectType()
class CopilotContextDoc extends CopilotDocType {
  @Field(() => String, { nullable: true })
  error!: string | null;
}

@ObjectType()
class CopilotContextFile implements ContextFile {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => SafeIntResolver)
  chunkSize!: number;

  @Field(() => ContextEmbedStatus)
  status!: ContextEmbedStatus;

  @Field(() => String, { nullable: true })
  error!: string | null;

  @Field(() => String)
  blobId!: string;

  @Field(() => SafeIntResolver)
  createdAt!: number;
}

@ObjectType()
class ContextMatchedFileChunk implements FileChunkSimilarity {
  @Field(() => String)
  fileId!: string;

  @Field(() => String)
  blobId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => SafeIntResolver)
  chunk!: number;

  @Field(() => String)
  content!: string;

  @Field(() => Float, { nullable: true })
  distance!: number | null;
}

@ObjectType()
class ContextWorkspaceEmbeddingStatus {
  @Field(() => SafeIntResolver)
  total!: number;

  @Field(() => SafeIntResolver)
  embedded!: number;
}

@ObjectType()
class ContextMatchedDocChunk implements DocChunkSimilarity {
  @Field(() => String)
  docId!: string;

  @Field(() => SafeIntResolver)
  chunk!: number;

  @Field(() => String)
  content!: string;

  @Field(() => Float, { nullable: true })
  distance!: number | null;
}

@Throttle()
@Resolver(() => CopilotType)
export class CopilotContextRootResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly event: EventBus,
    private readonly mutex: RequestMutex,
    private readonly chatSession: ChatSessionService,
    private readonly context: CopilotContextService,
    private readonly models: Models
  ) {}

  private async checkChatSession(
    user: CurrentUser,
    sessionId: string,
    workspaceId?: string
  ): Promise<void> {
    const session = await this.chatSession.get(sessionId);
    if (
      !session ||
      session.config.workspaceId !== workspaceId ||
      session.config.userId !== user.id
    ) {
      throw new CopilotSessionNotFound();
    }
  }

  @ResolveField(() => [CopilotContextType], {
    description: 'Get the context list of a session',
    complexity: 2,
  })
  @CallMetric('ai', 'context_create')
  async contexts(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('sessionId', { nullable: true }) sessionId?: string,
    @Args('contextId', { nullable: true }) contextId?: string
  ): Promise<CopilotContextType[]> {
    if (sessionId || contextId) {
      const lockFlag = `${COPILOT_LOCKER}:context:${sessionId || contextId}`;
      await using lock = await this.mutex.acquire(lockFlag);
      if (!lock) {
        throw new TooManyRequest('Server is busy');
      }

      if (contextId) {
        const context = await this.context.get(contextId);
        if (context) return [context];
      } else if (sessionId) {
        await this.checkChatSession(
          user,
          sessionId,
          copilot.workspaceId || undefined
        );
        const context = await this.context.getBySessionId(sessionId);
        if (context) return [context];
      }
    }

    if (copilot.workspaceId) {
      return [
        {
          id: undefined,
          workspaceId: copilot.workspaceId,
        },
      ];
    }

    return [];
  }

  @Mutation(() => String, {
    description: 'Create a context session',
  })
  @CallMetric('ai', 'context_create')
  async createCopilotContext(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('sessionId') sessionId: string
  ): Promise<string> {
    const lockFlag = `${COPILOT_LOCKER}:context:${sessionId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }
    await this.checkChatSession(user, sessionId, workspaceId);

    const context = await this.context.create(sessionId);
    return context.id;
  }

  @Mutation(() => Boolean, {
    description: 'queue workspace doc embedding',
  })
  @CallMetric('ai', 'context_queue_workspace_doc')
  async queueWorkspaceEmbedding(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('docId', { type: () => [String] }) docIds: string[]
  ): Promise<boolean> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    if (this.context.canEmbedding) {
      this.event.emit(
        'workspace.doc.embedding',
        docIds.map(docId => ({ workspaceId, docId }))
      );
      return true;
    }

    return false;
  }

  @Query(() => ContextWorkspaceEmbeddingStatus, {
    description: 'query workspace embedding status',
  })
  @CallMetric('ai', 'context_query_workspace_embedding_status')
  async queryWorkspaceEmbeddingStatus(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ): Promise<ContextWorkspaceEmbeddingStatus> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    if (this.context.canEmbedding) {
      const { total, embedded } =
        await this.models.copilotWorkspace.getWorkspaceEmbeddingStatus(
          workspaceId
        );
      return { total, embedded };
    }

    return { total: 0, embedded: 0 };
  }
}

@Throttle()
@Resolver(() => CopilotContextType)
export class CopilotContextResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly models: Models,
    private readonly mutex: RequestMutex,
    private readonly context: CopilotContextService,
    private readonly jobs: CopilotEmbeddingJob,
    private readonly storage: CopilotStorage
  ) {}

  private getSignal(req: Request) {
    const controller = new AbortController();
    req.socket.on('close', hasError => {
      if (hasError) {
        controller.abort();
      }
    });
    return controller.signal;
  }

  @ResolveField(() => [CopilotContextCategory], {
    description: 'list collections in context',
  })
  @CallMetric('ai', 'context_file_list')
  async collections(
    @Parent() context: CopilotContextType
  ): Promise<CopilotContextCategory[]> {
    if (!context.id) {
      return [];
    }
    const session = await this.context.get(context.id);
    const collections = session.collections;
    await this.models.copilotContext.mergeDocStatus(
      session.workspaceId,
      collections.flatMap(c => c.docs)
    );

    return collections;
  }

  @ResolveField(() => [CopilotContextCategory], {
    description: 'list tags in context',
  })
  @CallMetric('ai', 'context_file_list')
  async tags(
    @Parent() context: CopilotContextType
  ): Promise<CopilotContextCategory[]> {
    if (!context.id) {
      return [];
    }
    const session = await this.context.get(context.id);
    const tags = session.tags;
    await this.models.copilotContext.mergeDocStatus(
      session.workspaceId,
      tags.flatMap(c => c.docs)
    );

    return tags;
  }

  @ResolveField(() => [CopilotContextDoc], {
    description: 'list files in context',
  })
  @CallMetric('ai', 'context_file_list')
  async docs(@Parent() context: CopilotContextType): Promise<CopilotDocType[]> {
    if (!context.id) {
      return [];
    }
    const session = await this.context.get(context.id);
    const docs = session.docs;
    await this.models.copilotContext.mergeDocStatus(session.workspaceId, docs);

    return docs.map(doc => ({ ...doc, status: doc.status || null }));
  }

  @ResolveField(() => [CopilotContextFile], {
    description: 'list files in context',
  })
  @CallMetric('ai', 'context_file_list')
  async files(
    @Parent() context: CopilotContextType
  ): Promise<CopilotContextFile[]> {
    if (!context.id) {
      return [];
    }
    const session = await this.context.get(context.id);
    return session.files;
  }

  @Mutation(() => CopilotContextCategory, {
    description: 'add a category to context',
  })
  @CallMetric('ai', 'context_category_add')
  async addContextCategory(
    @Args({ name: 'options', type: () => AddContextCategoryInput })
    options: AddContextCategoryInput
  ): Promise<CopilotContextCategory> {
    const lockFlag = `${COPILOT_LOCKER}:context:${options.contextId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }
    const session = await this.context.get(options.contextId);

    try {
      const records = await session.addCategoryRecord(
        options.type,
        options.categoryId,
        options.docs || []
      );

      if (options.docs) {
        await this.jobs.addDocEmbeddingQueue(
          options.docs.map(docId => ({
            workspaceId: session.workspaceId,
            docId,
          })),
          { contextId: session.id, priority: 0 }
        );
      }

      return records;
    } catch (e: any) {
      throw new CopilotFailedToModifyContext({
        contextId: options.contextId,
        message: e.message,
      });
    }
  }

  @Mutation(() => Boolean, {
    description: 'remove a category from context',
  })
  @CallMetric('ai', 'context_category_remove')
  async removeContextCategory(
    @Args({ name: 'options', type: () => RemoveContextCategoryInput })
    options: RemoveContextCategoryInput
  ): Promise<boolean> {
    const lockFlag = `${COPILOT_LOCKER}:context:${options.contextId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }
    const session = await this.context.get(options.contextId);

    try {
      return await session.removeCategoryRecord(
        options.type,
        options.categoryId
      );
    } catch (e: any) {
      throw new CopilotFailedToModifyContext({
        contextId: options.contextId,
        message: e.message,
      });
    }
  }

  @Mutation(() => CopilotContextDoc, {
    description: 'add a doc to context',
  })
  @CallMetric('ai', 'context_doc_add')
  async addContextDoc(
    @Args({ name: 'options', type: () => AddContextDocInput })
    options: AddContextDocInput
  ): Promise<CopilotDocType> {
    const lockFlag = `${COPILOT_LOCKER}:context:${options.contextId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }
    const session = await this.context.get(options.contextId);

    try {
      const record = await session.addDocRecord(options.docId);

      await this.jobs.addDocEmbeddingQueue(
        [{ workspaceId: session.workspaceId, docId: options.docId }],
        { contextId: session.id, priority: 0 }
      );

      return { ...record, status: record.status || null };
    } catch (e: any) {
      throw new CopilotFailedToModifyContext({
        contextId: options.contextId,
        message: e.message,
      });
    }
  }

  @Mutation(() => Boolean, {
    description: 'remove a doc from context',
  })
  @CallMetric('ai', 'context_doc_remove')
  async removeContextDoc(
    @Args({ name: 'options', type: () => RemoveContextDocInput })
    options: RemoveContextDocInput
  ): Promise<boolean> {
    const lockFlag = `${COPILOT_LOCKER}:context:${options.contextId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }
    const session = await this.context.get(options.contextId);

    try {
      return await session.removeDocRecord(options.docId);
    } catch (e: any) {
      throw new CopilotFailedToModifyContext({
        contextId: options.contextId,
        message: e.message,
      });
    }
  }

  @Mutation(() => CopilotContextFile, {
    description: 'add a file to context',
  })
  @CallMetric('ai', 'context_file_add')
  async addContextFile(
    @CurrentUser() user: CurrentUser,
    @Context() ctx: { req: Request },
    @Args({ name: 'options', type: () => AddContextFileInput })
    options: AddContextFileInput,
    @Args({ name: 'content', type: () => GraphQLUpload })
    content: FileUpload
  ): Promise<CopilotContextFile> {
    if (!this.context.canEmbedding) {
      throw new CopilotEmbeddingUnavailable();
    }

    const lockFlag = `${COPILOT_LOCKER}:context:${options.contextId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    const length = Number(ctx.req.headers['content-length']);
    if (length && length >= MAX_EMBEDDABLE_SIZE) {
      throw new BlobQuotaExceeded();
    }

    const session = await this.context.get(options.contextId);

    try {
      const file = await session.addFile(
        options.blobId,
        content.filename,
        content.mimetype
      );

      const buffer = await readStream(content.createReadStream());
      await this.storage.put(
        user.id,
        session.workspaceId,
        options.blobId,
        buffer
      );

      await this.jobs.addFileEmbeddingQueue({
        userId: user.id,
        workspaceId: session.workspaceId,
        contextId: session.id,
        blobId: file.blobId,
        fileId: file.id,
        fileName: file.name,
      });

      return file;
    } catch (e: any) {
      // passthrough user friendly error
      if (e instanceof UserFriendlyError) {
        throw e;
      }
      throw new CopilotFailedToModifyContext({
        contextId: options.contextId,
        message: e.message,
      });
    }
  }

  @Mutation(() => Boolean, {
    description: 'remove a file from context',
  })
  @CallMetric('ai', 'context_file_remove')
  async removeContextFile(
    @Args({ name: 'options', type: () => RemoveContextFileInput })
    options: RemoveContextFileInput
  ): Promise<boolean> {
    if (!this.context.canEmbedding) {
      throw new CopilotEmbeddingUnavailable();
    }

    const lockFlag = `${COPILOT_LOCKER}:context:${options.contextId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }
    const session = await this.context.get(options.contextId);

    try {
      return await session.removeFile(options.fileId);
    } catch (e: any) {
      throw new CopilotFailedToModifyContext({
        contextId: options.contextId,
        message: e.message,
      });
    }
  }

  @ResolveField(() => [ContextMatchedFileChunk], {
    description: 'match file in context',
  })
  @CallMetric('ai', 'context_file_remove')
  async matchFiles(
    @Context() ctx: { req: Request },
    @Parent() context: CopilotContextType,
    @Args('content') content: string,
    @Args('limit', { type: () => SafeIntResolver, nullable: true })
    limit?: number,
    @Args('scopedThreshold', { type: () => Float, nullable: true })
    scopedThreshold?: number,
    @Args('threshold', { type: () => Float, nullable: true })
    threshold?: number
  ): Promise<ContextMatchedFileChunk[]> {
    if (!this.context.canEmbedding) {
      return [];
    }

    try {
      if (!context.id) {
        return await this.context.matchWorkspaceFiles(
          context.workspaceId,
          content,
          limit,
          this.getSignal(ctx.req),
          threshold
        );
      }

      const session = await this.context.get(context.id);
      return await session.matchFiles(
        content,
        limit,
        this.getSignal(ctx.req),
        scopedThreshold,
        threshold
      );
    } catch (e: any) {
      // passthrough user friendly error
      if (e instanceof UserFriendlyError) {
        throw e;
      }

      if (context.id) {
        throw new CopilotFailedToMatchContext({
          contextId: context.id,
          // don't record the large content
          content: content.slice(0, 512),
          message: e.message,
        });
      } else {
        throw new CopilotFailedToMatchGlobalContext({
          workspaceId: context.workspaceId,
          // don't record the large content
          content: content.slice(0, 512),
          message: e.message,
        });
      }
    }
  }

  @ResolveField(() => [ContextMatchedDocChunk], {
    description: 'match workspace docs',
  })
  @CallMetric('ai', 'context_match_workspace_doc')
  async matchWorkspaceDocs(
    @CurrentUser() user: CurrentUser,
    @Context() ctx: { req: Request },
    @Parent() context: CopilotContextType,
    @Args('content') content: string,
    @Args('limit', { type: () => SafeIntResolver, nullable: true })
    limit?: number,
    @Args('scopedThreshold', { type: () => Float, nullable: true })
    scopedThreshold?: number,
    @Args('threshold', { type: () => Float, nullable: true })
    threshold?: number
  ): Promise<ContextMatchedDocChunk[]> {
    if (!this.context.canEmbedding) {
      return [];
    }

    try {
      await this.ac
        .user(user.id)
        .workspace(context.workspaceId)
        .allowLocal()
        .assert('Workspace.Copilot');
      const allowEmbedding = await this.models.workspace.allowEmbedding(
        context.workspaceId
      );
      if (!allowEmbedding) {
        return [];
      }

      if (!context.id) {
        return await this.context.matchWorkspaceDocs(
          context.workspaceId,
          content,
          limit,
          this.getSignal(ctx.req),
          threshold
        );
      }

      const session = await this.context.get(context.id);
      if (session.workspaceId !== context.workspaceId) {
        throw new CopilotFailedToMatchContext({
          contextId: context.id,
          // don't record the large content
          content: content.slice(0, 512),
          message: 'context not in the same workspace',
        });
      }
      const chunks = await session.matchWorkspaceDocs(
        content,
        limit,
        this.getSignal(ctx.req),
        scopedThreshold,
        threshold
      );
      const docsMap = await Promise.all(
        chunks.map(c =>
          this.ac
            .user(user.id)
            .workspace(session.workspaceId)
            .doc(c.docId)
            .can('Doc.Read')
            .then(ret => [c.docId, ret] as const)
        )
      ).then(r => new Map(r));

      return chunks.filter(c => docsMap.get(c.docId));
    } catch (e: any) {
      // passthrough user friendly error
      if (e instanceof UserFriendlyError) {
        throw e;
      }

      if (context.id) {
        throw new CopilotFailedToMatchContext({
          contextId: context.id,
          // don't record the large content
          content: content.slice(0, 512),
          message: e.message,
        });
      } else {
        throw new CopilotFailedToMatchGlobalContext({
          workspaceId: context.workspaceId,
          // don't record the large content
          content: content.slice(0, 512),
          message: e.message,
        });
      }
    }
  }
}
