import { Field, ObjectType } from '@nestjs/graphql';
import { SafeIntResolver } from 'graphql-scalars';

import { Paginated } from '../../../base';
import { CopilotWorkspaceFile, IgnoredDoc } from '../../../models';

declare global {
  interface Events {
    'workspace.file.embedding.finished': {
      jobId: string;
    };
    'workspace.file.embedding.failed': {
      jobId: string;
    };
  }
}

@ObjectType('CopilotWorkspaceIgnoredDoc')
export class CopilotWorkspaceIgnoredDocType implements IgnoredDoc {
  @Field(() => String)
  docId!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  docCreatedAt!: Date | undefined;

  @Field(() => Date, { nullable: true })
  docUpdatedAt!: Date | undefined;

  @Field(() => String, { nullable: true })
  title!: string | undefined;

  @Field(() => String, { nullable: true })
  createdBy!: string | undefined;

  @Field(() => String, { nullable: true })
  createdByAvatar!: string | undefined;

  @Field(() => String, { nullable: true })
  updatedBy!: string | undefined;
}

@ObjectType()
export class PaginatedIgnoredDocsType extends Paginated(
  CopilotWorkspaceIgnoredDocType
) {}

@ObjectType('CopilotWorkspaceFile')
export class CopilotWorkspaceFileType implements CopilotWorkspaceFile {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  fileId!: string;

  @Field(() => String)
  blobId!: string;

  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => SafeIntResolver)
  size!: number;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class PaginatedCopilotWorkspaceFileType extends Paginated(
  CopilotWorkspaceFileType
) {}
