[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [index](../README.md) / ConfigExtensionFactory

# Function: ConfigExtensionFactory()

> **ConfigExtensionFactory**\<`Config`\>(`configId`): `ConfigFactory`\<`Config`\>

Create a config extension.
A config extension provides a configuration object for a block flavour.
The configuration object can be used like:
```ts
const config = std.provider.getOptional(ConfigIdentifier('my-flavour'));
```

## Type Parameters

### Config

`Config` *extends* `Record`\<`string`, `any`\>

## Parameters

### configId

`string`

The id of the config. Should be unique for each config.

## Returns

`ConfigFactory`\<`Config`\>

## Example

```ts
import { ConfigExtensionFactory } from '@blocksuite/std';
const MyConfigExtensionFactory = ConfigExtensionFactory<ConfigType>('my-flavour');
const MyConfigExtension = MyConfigExtensionFactory({
  option1: 'value1',
  option2: 'value2',
});
```
