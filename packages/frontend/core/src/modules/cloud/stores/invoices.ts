import { invoicesQuery } from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GraphQLService } from '../services/graphql';

export class InvoicesStore extends Store {
  constructor(private readonly graphqlService: GraphQLService) {
    super();
  }

  async fetchInvoices(skip: number, take: number, signal?: AbortSignal) {
    const data = await this.graphqlService.gql({
      query: invoicesQuery,
      variables: { skip, take },
      context: { signal },
    });

    if (!data.currentUser) {
      throw new Error('No logged in');
    }

    return data.currentUser;
  }
}
