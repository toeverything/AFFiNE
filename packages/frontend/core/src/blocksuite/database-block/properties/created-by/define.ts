import {
  EditorHostKey,
  propertyType,
  t,
} from '@blocksuite/affine/blocks/database';
import {
  UserListProvider,
  UserProvider,
} from '@blocksuite/affine/shared/services';
import zod from 'zod';

export const createdByColumnType = propertyType('created-by');
export const createdByPropertyModelConfig = createdByColumnType.modelConfig({
  name: 'Created By',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  rawValue: {
    schema: zod.string().nullable(),
    default: () => null,
    toString: ({ value }) => value ?? '',
    fromString: () => {
      return { value: null };
    },
    toJson: ({ value }) => value,
    setValue: () => {},
  },
  jsonValue: {
    schema: zod.string().nullable(),
    isEmpty: () => false,
    type: ({ dataSource }) => {
      const host = dataSource.serviceGet(EditorHostKey);
      const userService = host?.std.getOptional(UserProvider);
      const userListService = host?.std.getOptional(UserListProvider);

      return t.user.instance(
        userListService && userService
          ? {
              userService,
              userListService,
            }
          : undefined
      );
    },
  },
});
