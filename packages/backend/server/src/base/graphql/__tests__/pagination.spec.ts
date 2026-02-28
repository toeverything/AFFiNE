import { Args, Field, ObjectType, Query, Resolver } from '@nestjs/graphql';
import test from 'ava';
import Sinon from 'sinon';

import { createTestingApp } from '../../../__tests__/utils';
import { Public } from '../../../core/auth';
import {
  decodeWithJson,
  paginate,
  Paginated,
  paginateWithCustomCursor,
  PaginationInput,
} from '../pagination';

const TOTAL_COUNT = 105;
const ITEMS = Array.from({ length: TOTAL_COUNT }, (_, i) => ({ id: i + 1 }));
const paginationStub = Sinon.stub().callsFake(input => {
  const start = input.offset + (input.after ? parseInt(input.after) : 0);
  return paginate(
    ITEMS.slice(start, start + input.first),
    'id',
    input,
    TOTAL_COUNT
  );
});

const query = `query pagination($input: PaginationInput) {
  pagination(paginationInput: $input) {
    totalCount
    edges {
      cursor
      node {
        id
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;

@ObjectType()
class TestType {
  @Field()
  id!: number;
}

@ObjectType()
class PaginatedTestType extends Paginated(TestType) {}

@Public()
@Resolver(() => TestType)
class TestResolver {
  @Query(() => PaginatedTestType)
  async pagination(
    @Args(
      'paginationInput',
      {
        type: () => PaginationInput,
        defaultValue: { first: 10, offset: 0 },
      },
      PaginationInput.decode
    )
    input: PaginationInput
  ) {
    return paginationStub(input);
  }
}

const app = await createTestingApp({
  providers: [TestResolver],
});

test.after.always(async () => {
  await app.close();
});

test('should decode pagination input', async t => {
  await app.gql(query, {
    input: {
      first: 5,
      offset: 1,
      after: Buffer.from('4').toString('base64'),
    },
  });

  t.true(
    paginationStub.calledOnceWithExactly({
      first: 5,
      offset: 1,
      after: '4',
    })
  );
});

test('should return encode pageInfo', async t => {
  const result = paginate(
    ITEMS.slice(10, 20),
    'id',
    {
      first: 10,
      offset: 0,
      after: '9',
    },
    TOTAL_COUNT
  );

  t.snapshot(result);
});

test('should return encode pageInfo with custom cursor', async t => {
  const result = paginateWithCustomCursor(
    ITEMS.slice(10, 20),
    TOTAL_COUNT,
    { id: 10, name: 'test' },
    { id: 20, name: 'test2' }
  );

  t.snapshot(result);
});

test('should decode with json', async t => {
  const result = decodeWithJson<{ id: number; name: string }>(
    'eyJpZCI6MTAsIm5hbWUiOiJ0ZXN0In0='
  );
  t.snapshot(result);

  const result2 = decodeWithJson<{ id: number; name: string }>('');
  t.is(result2, null);
});
