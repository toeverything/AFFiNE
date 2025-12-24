import type {
  UserListService,
  UserService,
} from '@blocksuite/affine-shared/services';
import * as zod from 'zod';
import Zod from 'zod';

import { ct } from './composite-type.js';
import { defineDataType } from './data-type.js';
import type { TypeConvertConfig, TypeInstance, ValueTypeOf } from './type.js';
import { tv } from './type-variable.js';

export type SelectTag = Zod.TypeOf<typeof SelectTagSchema>;
export const SelectTagSchema = Zod.object({
  id: Zod.string(),
  color: Zod.string(),
  value: Zod.string(),
});
export const UserInfoSchema = Zod.object({
  userService: Zod.custom<UserService>(() => true),
  userListService: Zod.custom<UserListService>(() => true),
});
export type UserInfo = Zod.TypeOf<typeof UserInfoSchema>;
export const unknown = defineDataType('Unknown', zod.never(), zod.unknown());
export const dt = {
  number: defineDataType('Number', zod.number(), zod.number()),
  string: defineDataType('String', zod.string(), zod.string()),
  boolean: defineDataType('Boolean', zod.boolean(), zod.boolean()),
  richText: defineDataType('RichText', zod.string(), zod.string()),
  date: defineDataType('Date', zod.number(), zod.number()),
  url: defineDataType('URL', zod.string(), zod.string()),
  image: defineDataType('Image', zod.string(), zod.string()),
  tag: defineDataType('Tag', zod.array(SelectTagSchema), zod.string()),
  user: defineDataType('User', UserInfoSchema, zod.string()),
};
export const t = {
  unknown,
  ...dt,
  ...tv,
  ...ct,
};
const createTypeConvert = <From extends TypeInstance, To extends TypeInstance>(
  from: From,
  to: To,
  convert: (value: ValueTypeOf<From>) => ValueTypeOf<To>
): TypeConvertConfig<From, To> => {
  return {
    from,
    to,
    convert,
  };
};
export const converts: TypeConvertConfig[] = [
  ...Object.values(dt).map(from => ({
    from: from.instance(),
    to: t.unknown.instance(),
    convert: (value: unknown) => value,
  })),
  createTypeConvert(
    t.array.instance(unknown.instance()),
    unknown.instance(),
    value => value
  ),
  createTypeConvert(t.richText.instance(), t.string.instance(), value => value),
  createTypeConvert(t.url.instance(), t.string.instance(), value => value),
  createTypeConvert(t.user.instance(), t.string.instance(), value => value),
];
