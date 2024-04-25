import {
  gqlFetcherFactory,
  GraphQLError,
  type GraphQLQuery,
  type QueryOptions,
  type QueryResponse,
} from '@affine/graphql';
import { fromPromise, Service } from '@toeverything/infra';
import type { Observable } from 'rxjs';

import { BackendError } from '../error';
import { AuthService } from './auth';
import type { FetchService } from './fetch';

export class GraphQLService extends Service {
  constructor(private readonly fetcher: FetchService) {
    super();
  }

  private readonly rawGql = gqlFetcherFactory('/graphql', this.fetcher.fetch);

  rxGql = <Query extends GraphQLQuery>(
    options: QueryOptions<Query>
  ): Observable<QueryResponse<Query>> => {
    return fromPromise(signal => {
      return this.gql({
        ...options,
        context: {
          signal,
          ...options.context,
        },
      } as any);
    });
  };

  gql = async <Query extends GraphQLQuery>(
    options: QueryOptions<Query>
  ): Promise<QueryResponse<Query>> => {
    try {
      return await this.rawGql(options);
    } catch (err) {
      if (err instanceof Array) {
        for (const error of err) {
          if (error instanceof GraphQLError && error.extensions?.code === 403) {
            this.framework.get(AuthService).session.revalidate();
          }
        }
        throw new BackendError(new Error('Graphql Error'));
      }
      throw err;
    }
  };
}
