import { Injectable } from '@nestjs/common';

import { Config, OnEvent } from '../../base';

@Injectable()
export class CustomerIoService {
  #fetch: ((url: string, options?: RequestInit) => Promise<Response>) | null =
    null;
  constructor(private readonly config: Config) {}

  @OnEvent('config.init')
  setup() {
    const { enabled, token } = this.config.customerIo;
    if (enabled && token) {
      this.#fetch = (url, options) => {
        return fetch(url, {
          ...options,
          headers: {
            Authorization: `Basic ${token}`,
            'Content-Type': 'application/json',
            ...options?.headers,
          },
        });
      };
    } else {
      this.#fetch = null;
    }
  }

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if (event.updates.customerIo) {
      this.setup();
    }
  }

  @OnEvent('user.created')
  @OnEvent('user.updated')
  async onUserUpdated(user: Events['user.updated'] | Events['user.created']) {
    await this.#fetch?.(
      `https://track.customer.io/api/v1/customers/${user.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          created_at: Number(user.createdAt) / 1000,
        }),
      }
    );
  }

  @OnEvent('user.deleted')
  async onUserDeleted(user: Events['user.deleted']) {
    if (user.emailVerifiedAt) {
      // suppress email if email is verified
      await this.#fetch?.(
        `https://track.customer.io/api/v1/customers/${user.email}/suppress`,
        {
          method: 'POST',
        }
      );
    }

    await this.#fetch?.(
      `https://track.customer.io/api/v1/customers/${user.id}`,
      {
        method: 'DELETE',
      }
    );
  }
}
