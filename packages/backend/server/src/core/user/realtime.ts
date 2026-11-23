import type {
  CurrentUserProfileSnapshot,
  UserSettingsSnapshot,
} from '@affine/realtime';
import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import { AuthenticationRequired, OnEvent, UserNotFound } from '../../base';
import { Feature, Models } from '../../models';
import { sessionUser } from '../auth/service';
import { AvailableUserFeatureConfig } from '../features/types';
import { registerRealtimeLiveQuery } from '../realtime/provider';
import { RealtimePublisher } from '../realtime/publisher';
import { RealtimeRegistry } from '../realtime/registry';
import {
  realtimeUserProfileRoom,
  realtimeUserSettingsRoom,
} from '../realtime/rooms';

const emptyInput = z.object({}).strict();

function assertAuthenticated(user?: { id: string }) {
  if (!user) {
    throw new AuthenticationRequired();
  }
  return user;
}

@Injectable()
export class UserRealtimeProvider
  extends AvailableUserFeatureConfig
  implements OnModuleInit
{
  constructor(
    private readonly models: Models,
    @Optional() private readonly registry?: RealtimeRegistry,
    @Optional() private readonly publisher?: RealtimePublisher
  ) {
    super();
  }

  onModuleInit() {
    if (!this.registry) return;

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'user.profile.get',
        input: emptyInput,
        handle: async user => ({
          user: user ? await this.getProfile(user.id) : null,
        }),
      },
      topic: {
        name: 'user.profile.changed',
        input: emptyInput,
        authorize: async () => {},
        room: user => {
          if (!user) {
            throw new Error('Authenticated user is required');
          }
          return realtimeUserProfileRoom(user.id);
        },
      },
    });

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'user.settings.get',
        input: emptyInput,
        handle: async user => ({
          settings: await this.getSettings(assertAuthenticated(user).id),
        }),
      },
      topic: {
        name: 'user.settings.changed',
        input: emptyInput,
        authorize: async () => {},
        room: user => {
          if (!user) {
            throw new Error('Authenticated user is required');
          }
          return realtimeUserSettingsRoom(user.id);
        },
      },
    });
  }

  @OnEvent('user.updated', { suppressError: true })
  onUserUpdated(user: Events['user.updated']) {
    this.publisher?.publishChanged('user.profile.changed', {}, 'user-updated', {
      room: realtimeUserProfileRoom(user.id),
    });
  }

  @OnEvent('user.settings.updated', { suppressError: true })
  onUserSettingsUpdated({ userId }: Events['user.settings.updated']) {
    this.publisher?.publishChanged(
      'user.settings.changed',
      {},
      'settings-updated',
      { room: realtimeUserSettingsRoom(userId) }
    );
  }

  private async getProfile(
    userId: string
  ): Promise<CurrentUserProfileSnapshot> {
    const user = await this.models.user.get(userId);
    if (!user) {
      throw new UserNotFound();
    }
    const current = sessionUser(user);
    return {
      id: current.id,
      name: current.name,
      email: current.email,
      emailVerified: current.emailVerified,
      hasPassword: current.hasPassword,
      avatarUrl: current.avatarUrl ?? null,
      features: (
        await this.models.userFeature.list(
          userId,
          undefined,
          Array.from(this.availableUserFeatures())
        )
      )
        .filter(feature => this.availableUserFeatures().has(feature))
        .map(feature => this.serializeFeature(feature)),
    };
  }

  private serializeFeature(feature: string) {
    return (
      Object.entries(Feature).find(([, value]) => value === feature)?.[0] ??
      feature
    );
  }

  private async getSettings(userId: string): Promise<UserSettingsSnapshot> {
    return await this.models.userSettings.get(userId);
  }
}
