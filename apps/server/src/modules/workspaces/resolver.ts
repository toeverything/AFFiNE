import { randomUUID } from 'node:crypto';

import {
  Args,
  Field,
  ID,
  Mutation,
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
  description: 'Workspace type',
  valuesMap: {
    Normal: {
      description: 'Normal workspace',
    },
    Private: {
      description: 'Private workspace',
    },
  },
});

@ObjectType()
export class Workspace implements workspaces {
  @Field(() => ID)
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

  // debug only query should be removed
  @Query(() => [Workspace], {
    name: 'workspaces',
    description: 'Get all workspaces',
  })
  async workspaces() {
    return this.prisma.workspaces.findMany();
  }

  @Query(() => Workspace, {
    name: 'workspace',
    description: 'Get workspace by id',
  })
  async workspace(@Args('id') id: string) {
    return this.prisma.workspaces.findUnique({
      where: { id },
    });
  }

  // create workspace
  @Mutation(() => Workspace, {
    name: 'createWorkspace',
    description: 'Create workspace',
  })
  async createWorkspace() {
    return this.prisma.workspaces.create({
      data: {
        id: randomUUID(),
        type: WorkspaceType.Private,
        public: false,
        created_at: new Date(),
      },
    });
  }
}
