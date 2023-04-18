import {
  Args,
  Field,
  ObjectType,
  Query,
  registerEnumType,
  Resolver,
} from '@nestjs/graphql';
import type { workspaces } from '@prisma/client';

import { PrismaService } from '../../prisma/service';

export enum WorkspaceType {
  Private = 0,
  Normal = 1,
}

registerEnumType(WorkspaceType, {
  name: 'WorkspaceType',
});

@ObjectType()
export class Workspace implements workspaces {
  @Field()
  id!: string;
  @Field({ description: 'is Public workspace' })
  public!: boolean;
  @Field(() => WorkspaceType, { description: 'Workspace type' })
  type!: WorkspaceType;
  @Field({ description: 'Workspace created date' })
  created_at!: Date;
}

@Resolver(() => Workspace)
export class WorkspaceResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => Workspace, {
    name: 'workspace',
    description: 'Get workspace by id',
  })
  async workspace(@Args('id') id: string) {
    return this.prisma.workspaces.findUnique({
      where: { id },
    });
  }
}
