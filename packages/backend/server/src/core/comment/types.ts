import {
  createUnionType,
  Field,
  ID,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';

import { Paginated } from '../../base';
import {
  Comment,
  CommentChange,
  CommentChangeAction,
  CommentCreate,
  CommentResolve,
  CommentUpdate,
  DeletedChangeItem,
  DocMode,
  Reply,
  ReplyCreate,
  ReplyUpdate,
} from '../../models';
import { PublicUserType } from '../user';

@ObjectType()
export class CommentObjectType implements Partial<Comment> {
  @Field(() => ID)
  id!: string;

  @Field(() => GraphQLJSONObject, {
    description: 'The content of the comment',
  })
  content!: object;

  @Field(() => Boolean, {
    description: 'Whether the comment is resolved',
  })
  resolved!: boolean;

  @Field(() => PublicUserType, {
    description: 'The user who created the comment',
  })
  user!: PublicUserType;

  @Field(() => Date, {
    description: 'The created at time of the comment',
  })
  createdAt!: Date;

  @Field(() => Date, {
    description: 'The updated at time of the comment',
  })
  updatedAt!: Date;

  @Field(() => [ReplyObjectType], {
    description: 'The replies of the comment',
  })
  replies!: ReplyObjectType[];
}

@ObjectType()
export class ReplyObjectType implements Partial<Reply> {
  @Field(() => ID)
  commentId!: string;

  @Field(() => ID)
  id!: string;

  @Field(() => GraphQLJSONObject, {
    description: 'The content of the reply',
  })
  content!: object;

  @Field(() => PublicUserType, {
    description: 'The user who created the reply',
  })
  user!: PublicUserType;

  @Field(() => Date, {
    description: 'The created at time of the reply',
  })
  createdAt!: Date;

  @Field(() => Date, {
    description: 'The updated at time of the reply',
  })
  updatedAt!: Date;
}

@ObjectType()
export class DeletedCommentObjectType implements DeletedChangeItem {
  @Field(() => Date, {
    description: 'The deleted at time of the comment or reply',
  })
  deletedAt!: Date;

  @Field(() => Date, {
    description: 'The updated at time of the comment or reply',
  })
  updatedAt!: Date;
}

export const UnionCommentObjectType = createUnionType({
  name: 'UnionCommentObjectType',
  types: () =>
    [CommentObjectType, ReplyObjectType, DeletedCommentObjectType] as const,
});

registerEnumType(CommentChangeAction, {
  name: 'CommentChangeAction',
  description: 'Comment change action',
});

@ObjectType()
export class CommentChangeObjectType implements Omit<CommentChange, 'item'> {
  @Field(() => CommentChangeAction, {
    description: 'The action of the comment change',
  })
  action!: CommentChangeAction;

  @Field(() => ID)
  id!: string;

  @Field(() => ID, {
    nullable: true,
  })
  commentId?: string;

  @Field(() => GraphQLJSONObject, {
    description:
      'The item of the comment or reply, different types have different fields, see UnionCommentObjectType',
  })
  item!: object;
}

@ObjectType()
export class PaginatedCommentObjectType extends Paginated(CommentObjectType) {}

@ObjectType()
export class PaginatedCommentChangeObjectType extends Paginated(
  CommentChangeObjectType
) {}

@InputType()
export class CommentCreateInput implements Partial<CommentCreate> {
  @Field(() => ID)
  workspaceId!: string;

  @Field(() => ID)
  docId!: string;

  @Field(() => String)
  docTitle!: string;

  @Field(() => DocMode)
  docMode!: DocMode;

  @Field(() => GraphQLJSONObject)
  content!: object;

  @Field(() => [String], {
    nullable: true,
    description:
      'The mention user ids, if not provided, the comment will not be mentioned',
  })
  mentions?: string[];
}

@InputType()
export class CommentUpdateInput implements Partial<CommentUpdate> {
  @Field(() => ID)
  id!: string;

  @Field(() => GraphQLJSONObject)
  content!: object;
}

@InputType()
export class CommentResolveInput implements Partial<CommentResolve> {
  @Field(() => ID)
  id!: string;

  @Field(() => Boolean, {
    description: 'Whether the comment is resolved',
  })
  resolved!: boolean;
}

@InputType()
export class ReplyCreateInput implements Partial<ReplyCreate> {
  @Field(() => ID)
  commentId!: string;

  @Field(() => GraphQLJSONObject)
  content!: object;

  @Field(() => String)
  docTitle!: string;

  @Field(() => DocMode)
  docMode!: DocMode;

  @Field(() => [String], {
    nullable: true,
    description:
      'The mention user ids, if not provided, the comment reply will not be mentioned',
  })
  mentions?: string[];
}

@InputType()
export class ReplyUpdateInput implements Partial<ReplyUpdate> {
  @Field(() => ID)
  id!: string;

  @Field(() => GraphQLJSONObject)
  content!: object;
}
