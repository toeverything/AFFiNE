[**BlockSuite API Documentation**](../../../README.md)

***

[BlockSuite API Documentation](../../../README.md) / [@blocksuite/store](../README.md) / Text

# Class: Text\<TextAttributes\>

Text is an abstraction of Y.Text.
It provides useful methods to manipulate the text content.

## Example

```ts
const text = new Text('Hello, world!');
text.insert(' blocksuite', 7);
text.delete(7, 1);
text.format(7, 1, { bold: true });
text.join(new Text(' blocksuite'));
text.split(7, 1);
```

Text [delta](https://docs.yjs.dev/api/delta-format) is a format from Y.js.

## Type Parameters

### TextAttributes

`TextAttributes` *extends* `BaseTextAttributes` = `BaseTextAttributes`

## Constructors

### Constructor

> **new Text**\<`TextAttributes`\>(`input?`): `Text`\<`TextAttributes`\>

#### Parameters

##### input?

The input can be a string, a Y.Text instance, or an array of DeltaInsert.

`string` | `YText` | `DeltaInsert`\<`TextAttributes`\>[]

#### Returns

`Text`\<`TextAttributes`\>

## Accessors

### deltas$

#### Get Signature

> **get** **deltas$**(): `Signal`\<`DeltaOperation`[]\>

Get the text delta as a signal.

##### Returns

`Signal`\<`DeltaOperation`[]\>

## Methods

### applyDelta()

> **applyDelta**(`delta`): `void`

Apply a delta to the text.

#### Parameters

##### delta

`DeltaOperation`[]

The delta to apply.

#### Returns

`void`

#### Example

```ts
const text = new Text('Hello, world!');
text.applyDelta([{insert: ' blocksuite', attributes: { bold: true }}]);
```

***

### clear()

> **clear**(): `void`

Clear the text content.

#### Returns

`void`

***

### clone()

> **clone**(): `Text`\<\{ `bold?`: `true` \| `null`; `code?`: `true` \| `null`; `italic?`: `true` \| `null`; `link?`: `string` \| `null`; `strike?`: `true` \| `null`; `underline?`: `true` \| `null`; \}\>

Clone the text to a new Text instance.

#### Returns

`Text`\<\{ `bold?`: `true` \| `null`; `code?`: `true` \| `null`; `italic?`: `true` \| `null`; `link?`: `string` \| `null`; `strike?`: `true` \| `null`; `underline?`: `true` \| `null`; \}\>

A new Text instance.

***

### delete()

> **delete**(`index`, `length`): `void`

Delete the text content.

#### Parameters

##### index

`number`

The index to delete.

##### length

`number`

The length to delete.

#### Returns

`void`

***

### format()

> **format**(`index`, `length`, `format`): `void`

Format the text content.

#### Parameters

##### index

`number`

The index to format.

##### length

`number`

The length to format.

##### format

`Record`\<`string`, `unknown`\>

The format to apply.

#### Returns

`void`

#### Example

```ts
const text = new Text('Hello, world!');
text.format(7, 1, { bold: true });
```

***

### insert()

> **insert**(`content`, `index`, `attributes?`): `void`

Insert content at the specified index.

#### Parameters

##### content

`string`

The content to insert.

##### index

`number`

The index to insert.

##### attributes?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Example

```ts
const text = new Text('Hello, world!');
text.insert(' blocksuite', 7);
```

***

### join()

> **join**(`other`): `void`

Join current text with another text.

#### Parameters

##### other

`Text`

The other text to join.

#### Returns

`void`

#### Example

```ts
const text = new Text('Hello, world!');
const other = new Text(' blocksuite');
text.join(other);
```

***

### replace()

> **replace**(`index`, `length`, `content`, `attributes?`): `void`

Replace the text content with a new content.

#### Parameters

##### index

`number`

The index to replace.

##### length

`number`

The length to replace.

##### content

`string`

The content to replace.

##### attributes?

`Record`\<`string`, `unknown`\>

The attributes to replace.

#### Returns

`void`

#### Example

```ts
const text = new Text('Hello, world!');
text.replace(7, 1, ' blocksuite');
```

***

### sliceToDelta()

> **sliceToDelta**(`begin`, `end?`): `DeltaOperation`[]

Slice the text to a delta.

#### Parameters

##### begin

`number`

The begin index.

##### end?

`number`

The end index.

#### Returns

`DeltaOperation`[]

The delta of the sliced text.

***

### split()

> **split**(`index`, `length`): `Text`

Split the text into another Text.

#### Parameters

##### index

`number`

The index to split.

##### length

`number` = `0`

The length to split.

#### Returns

`Text`

The right part of the text.

#### Example

```ts
const text = new Text('Hello, world!');
text.split(7, 1);
```

NOTE: The string included in [index, index + length) will be deleted.

Here are three cases for point position(index + length):

```
[{insert: 'abc', ...}, {insert: 'def', ...}, {insert: 'ghi', ...}]
1. abc|de|fghi
   left: [{insert: 'abc', ...}]
   right: [{insert: 'f', ...}, {insert: 'ghi', ...}]
2. abc|def|ghi
   left: [{insert: 'abc', ...}]
   right: [{insert: 'ghi', ...}]
3. abc|defg|hi
   left: [{insert: 'abc', ...}]
   right: [{insert: 'hi', ...}]
```

***

### toDelta()

> **toDelta**(): `DeltaOperation`[]

Get the text delta.

#### Returns

`DeltaOperation`[]

The delta of the text.

***

### toString()

> **toString**(): `string`

Get the text content as a string.
In most cases, you should not use this method. It will lose the delta attributes information.

#### Returns

`string`

The text content.
