import { ORMClient } from './client';

// The ORM hooks are used to define the transformers that will be applied on entities when they are loaded from the data providers.
// All transformers are doing in memory, none of the data under the hood will be changed.
//
// for example:
// data in providers: { color: 'red' }
// hook: { color: 'red' } => { color: '#FF0000' }
//
// ORMClient.defineHook(
//   'demo',
//   'deprecate color field and introduce colors filed',
//   {
//     deserialize(tag) {
//       tag.color = stringToHex(tag.color)
//       return tag;
//     },
//   }
// );

export { ORMClient };
