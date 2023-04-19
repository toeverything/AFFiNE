import { randomUUID } from 'node:crypto';

import {
  Args,
  Field,
  ID,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type { User, Workspace } from '@prisma/client';

import { PrismaService } from '../../prisma';
import { CurrentUser } from '../users';
import { Permission } from './types';

@ObjectType()
export class WorkspaceType implements Partial<Workspace> {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'is Public workspace' })
  public!: boolean;

  @Field({ description: 'Workspace created date' })
  created_at!: Date;
}

@Resolver(() => WorkspaceType)
export class WorkspaceResolver {
  constructor(private readonly prisma: PrismaService) {}

  // debug only query should be removed
  @Query(() => [WorkspaceType], {
    name: 'workspaces',
    description: 'Get all workspaces',
  })
  async workspaces() {
    return this.prisma.workspace.findMany();
  }

  @Query(() => WorkspaceType, {
    name: 'workspace',
    description: 'Get workspace by id',
  })
  async workspace(@Args('id') id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
    });
  }

  // create workspace
  @Mutation(() => WorkspaceType, {
    name: 'createWorkspace',
    description: 'Create workspace',
  })
  async createWorkspace(@CurrentUser() user: User) {
    const workspaceId = randomUUID();
    const [ws] = await this.prisma.$transaction([
      this.prisma.workspace.create({
        data: {
          id: workspaceId,
          public: false,
        },
      }),
      this.prisma.permission.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          workspaceId,
          type: Permission.Owner,
          accepted: true,
        },
      }),
    ]);

    return ws;
  }
}
