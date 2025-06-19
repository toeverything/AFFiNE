import {
  createUnionType,
  Field,
  Float,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';

import { PublicUserType } from '../../core/user';
import { PublicUser } from '../../models';
import { SearchTable } from './tables';

export enum SearchQueryType {
  match = 'match',
  boost = 'boost',
  boolean = 'boolean',
  exists = 'exists',
  all = 'all',
}

export enum SearchQueryOccur {
  should = 'should',
  must = 'must',
  must_not = 'must_not',
}

registerEnumType(SearchTable, {
  name: 'SearchTable',
  description: 'Search table',
});

registerEnumType(SearchQueryType, {
  name: 'SearchQueryType',
  description: 'Search query type',
});

registerEnumType(SearchQueryOccur, {
  name: 'SearchQueryOccur',
  description: 'Search query occur',
});

export interface SearchDoc {
  docId: string;
  blockId: string;
  title: string;
  highlight: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  updatedByUserId: string;
  createdByUser?: PublicUser;
  updatedByUser?: PublicUser;
}

@InputType()
export class SearchQuery {
  @Field(() => SearchQueryType)
  type!: SearchQueryType;

  @Field({ nullable: true })
  field?: string;

  @Field({ nullable: true })
  match?: string;

  @Field(() => SearchQuery, { nullable: true })
  query?: SearchQuery;

  @Field(() => [SearchQuery], { nullable: true })
  queries?: SearchQuery[];

  @Field(() => SearchQueryOccur, { nullable: true })
  occur?: SearchQueryOccur;

  @Field(() => Float, { nullable: true })
  boost?: number;
}

@InputType()
export class SearchHighlight {
  @Field()
  field!: string;

  @Field()
  before!: string;

  @Field()
  end!: string;
}

@InputType()
export class SearchPagination {
  @Field({ nullable: true })
  limit?: number;

  @Field({ nullable: true })
  skip?: number;

  @Field({ nullable: true })
  cursor?: string;
}

@InputType()
export class SearchOptions {
  @Field(() => [String])
  fields!: string[];

  @Field(() => [SearchHighlight], { nullable: true })
  highlights?: SearchHighlight[];

  @Field(() => SearchPagination, { nullable: true })
  pagination?: SearchPagination;
}

@InputType()
export class SearchInput {
  @Field(() => SearchTable)
  table!: SearchTable;

  @Field(() => SearchQuery)
  query!: SearchQuery;

  @Field(() => SearchOptions)
  options!: SearchOptions;
}

@InputType()
export class AggregateHitsPagination {
  @Field({ nullable: true })
  limit?: number;

  @Field({ nullable: true })
  skip?: number;
}

@InputType()
export class AggregateHitsOptions {
  @Field(() => [String])
  fields!: string[];

  @Field(() => [SearchHighlight], { nullable: true })
  highlights?: SearchHighlight[];

  @Field(() => AggregateHitsPagination, { nullable: true })
  pagination?: AggregateHitsPagination;
}

@InputType()
export class AggregateOptions {
  @Field(() => AggregateHitsOptions)
  hits!: AggregateHitsOptions;

  @Field(() => SearchPagination, { nullable: true })
  pagination?: SearchPagination;
}

@InputType()
export class AggregateInput {
  @Field(() => SearchTable)
  table!: SearchTable;

  @Field(() => SearchQuery)
  query!: SearchQuery;

  @Field(() => String)
  field!: string;

  @Field(() => AggregateOptions)
  options!: AggregateOptions;
}

@InputType()
export class SearchDocsInput {
  @Field(() => String)
  keyword!: string;

  @Field({
    nullable: true,
    description: 'Limit the number of docs to return, default is 20',
  })
  limit?: number;
}

@ObjectType()
export class BlockObjectType {
  @Field(() => [String], { nullable: true })
  workspaceId?: string[];

  @Field(() => [String], { nullable: true })
  docId?: string[];

  @Field(() => [String], { nullable: true })
  blockId?: string[];

  @Field(() => [String], { nullable: true })
  content?: string[];

  @Field(() => [String], { nullable: true })
  flavour?: string[];

  @Field(() => [String], { nullable: true })
  blob?: string[];

  @Field(() => [String], { nullable: true })
  refDocId?: string[];

  @Field(() => [String], { nullable: true })
  ref?: string[];

  @Field(() => [String], { nullable: true })
  parentFlavour?: string[];

  @Field(() => [String], { nullable: true })
  parentBlockId?: string[];

  @Field(() => [String], { nullable: true })
  additional?: string[];

  @Field(() => [String], { nullable: true })
  markdownPreview?: string[];

  @Field(() => [String], { nullable: true })
  createdByUserId?: string[];

  @Field(() => [String], { nullable: true })
  updatedByUserId?: string[];

  @Field(() => [Date], { nullable: true })
  createdAt?: Date[];

  @Field(() => [Date], { nullable: true })
  updatedAt?: Date[];
}

@ObjectType()
export class DocObjectType {
  @Field(() => [String], { nullable: true })
  workspaceId?: string[];

  @Field(() => [String], { nullable: true })
  docId?: string[];

  @Field(() => [String], { nullable: true })
  title?: string[];

  @Field(() => [String], { nullable: true })
  summary?: string[];

  @Field(() => [String], { nullable: true })
  journal?: string[];

  @Field(() => [String], { nullable: true })
  createdByUserId?: string[];

  @Field(() => [String], { nullable: true })
  updatedByUserId?: string[];

  @Field(() => [Date], { nullable: true })
  createdAt?: Date[];

  @Field(() => [Date], { nullable: true })
  updatedAt?: Date[];
}

export const UnionSearchItemObjectType = createUnionType({
  name: 'UnionSearchItemObjectType',
  types: () => [BlockObjectType, DocObjectType] as const,
});

@ObjectType()
export class SearchNodeObjectType {
  @Field(() => GraphQLJSONObject, {
    description: 'The search result fields, see UnionSearchItemObjectType',
  })
  fields!: object;

  @Field(() => GraphQLJSONObject, {
    description: 'The search result fields, see UnionSearchItemObjectType',
    nullable: true,
  })
  highlights?: object;
}

@ObjectType()
export class SearchResultPagination {
  @Field(() => Int)
  count!: number;

  @Field(() => Boolean)
  hasMore!: boolean;

  @Field(() => String, { nullable: true })
  nextCursor?: string;
}

@ObjectType()
export class SearchResultObjectType {
  @Field(() => [SearchNodeObjectType])
  nodes!: SearchNodeObjectType[];

  @Field(() => SearchResultPagination)
  pagination!: SearchResultPagination;
}

@ObjectType()
export class AggregateBucketHitsObjectType {
  @Field(() => [SearchNodeObjectType])
  nodes!: SearchNodeObjectType[];
}

@ObjectType()
export class AggregateBucketObjectType {
  @Field(() => String)
  key!: string;

  @Field(() => Int)
  count!: number;

  @Field(() => AggregateBucketHitsObjectType, {
    description: 'The hits object',
  })
  hits!: AggregateBucketHitsObjectType;
}

@ObjectType()
export class AggregateResultObjectType {
  @Field(() => [AggregateBucketObjectType])
  buckets!: AggregateBucketObjectType[];

  @Field(() => SearchResultPagination)
  pagination!: SearchResultPagination;
}

@ObjectType()
export class SearchDocObjectType implements Partial<SearchDoc> {
  @Field(() => String)
  docId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  blockId!: string;

  @Field(() => String)
  highlight!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => PublicUserType, { nullable: true })
  createdByUser?: PublicUserType;

  @Field(() => PublicUserType, { nullable: true })
  updatedByUser?: PublicUserType;
}
