import {
  Field,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';

export enum BlobUploadMethod {
  GRAPHQL = 'GRAPHQL',
  PRESIGNED = 'PRESIGNED',
  MULTIPART = 'MULTIPART',
}

registerEnumType(BlobUploadMethod, {
  name: 'BlobUploadMethod',
  description: 'Blob upload method',
});

@ObjectType()
class BlobUploadedPart {
  @Field(() => Int)
  partNumber!: number;

  @Field()
  etag!: string;
}

@ObjectType()
export class BlobUploadInit {
  @Field(() => BlobUploadMethod)
  method!: BlobUploadMethod;

  @Field()
  blobKey!: string;

  @Field(() => Boolean, { nullable: true })
  alreadyUploaded?: boolean;

  @Field(() => String, { nullable: true })
  uploadUrl?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  headers?: Record<string, string>;

  @Field(() => Date, { nullable: true })
  expiresAt?: Date;

  @Field(() => String, { nullable: true })
  uploadId?: string;

  @Field(() => Int, { nullable: true })
  partSize?: number;

  @Field(() => [BlobUploadedPart], { nullable: true })
  uploadedParts?: BlobUploadedPart[];
}

@ObjectType()
export class BlobUploadPart {
  @Field()
  uploadUrl!: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  headers?: Record<string, string>;

  @Field(() => Date, { nullable: true })
  expiresAt?: Date;
}

@InputType()
export class BlobUploadPartInput {
  @Field(() => Int)
  partNumber!: number;

  @Field()
  etag!: string;
}

@ObjectType()
export class ListedBlob {
  @Field()
  key!: string;

  @Field()
  mime!: string;

  @Field()
  size!: number;

  @Field()
  createdAt!: string;
}
