import { Field, ObjectType } from '@nestjs/graphql';
import { SafeIntResolver } from 'graphql-scalars';

import { Paginated } from '../../../base';
import { CopilotWorkspaceArtifact, IgnoredDoc } from '../../../models';

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

@ObjectType('CopilotWorkspaceArtifact')
export class CopilotWorkspaceArtifactType implements CopilotWorkspaceArtifact {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  artifactId!: string;

  @Field(() => String)
  contentHash!: string;

  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  embeddingStatus!: 'processing' | 'ready' | 'failed';

  @Field(() => String)
  mediaType!: string;

  @Field(() => SafeIntResolver)
  size!: number;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class PaginatedCopilotWorkspaceArtifactType extends Paginated(
  CopilotWorkspaceArtifactType
) {}
