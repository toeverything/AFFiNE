[**BlockSuite API Documentation**](../../../README.md)

***

[BlockSuite API Documentation](../../../README.md) / [@blocksuite/store](../README.md) / Boxed

# Class: Boxed\<Value\>

Boxed is to store raw data in Yjs.
By default, store will try to convert a object to a Y.Map.
If you want to store a raw object for you want to manipulate the Y.Map directly, you can use Boxed.

> [!NOTE]
> Please notice that the data will be stored in Y.Map anyway so it can not hold data structure like function.

## Example

```ts
const boxedObject = new Boxed({ a: 1, b: 2 });
const boxedYMap = new Boxed(new Y.Map());
boxedObject.getValue().a; // 1
boxedYMap.getValue().set('a', 1);
boxedObject.setValue({ foo: 'bar' });
```

## Type Param

The type of the value stored in the Boxed.

## Type Parameters

### Value

`Value` = `unknown`

## Methods

### getValue()

> **getValue**(): `Value` \| `undefined`

Get the current value of the Boxed.

#### Returns

`Value` \| `undefined`

***

### setValue()

> **setValue**(`value`): `Value`

Replace the current value of the Boxed.

#### Parameters

##### value

`Value`

The new value to set.

#### Returns

`Value`

***

### from()

> `static` **from**\<`Value`\>(`map`): `Boxed`\<`Value`\>

Create a Boxed from a Y.Map.
It is useful when you sync a Y.Map from remote.

#### Type Parameters

##### Value

`Value`

The type of the value.

#### Parameters

##### map

`YMap`\<`unknown`\>

#### Returns

`Boxed`\<`Value`\>

#### Example

```ts
const doc1 = new Y.Doc();
const doc2 = new Y.Doc();
keepSynced(doc1, doc2);

const data1 = doc1.getMap('data');
const boxed1 = new Boxed({ a: 1, b: 2 });
data1.set('boxed', boxed1.yMap);

const data2 = doc2.getMap('data');
const boxed2 = Boxed.from<{ a: number; b: number }>(data2.get('boxed'));
```

***

### is()

> `static` **is**(`value`): `value is Boxed<unknown>`

Check if a value is a Boxed.

#### Parameters

##### value

`unknown`

#### Returns

`value is Boxed<unknown>`

#### Example

```ts
const doc = new Y.Doc();

const data = doc.getMap('data');
const boxed = new Boxed({ a: 1, b: 2 });
Boxed.is(boxed); // true

data.set('boxed', boxed.yMap);
Boxed.is(data.get('boxed)); // true
```
