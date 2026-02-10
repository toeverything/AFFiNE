import { parseListPartsXml } from '@affine/s3-compat';
import test from 'ava';

test('parseListPartsXml handles array parts and pagination', t => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult>
  <Bucket>test</Bucket>
  <Key>key</Key>
  <UploadId>upload-id</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <NextPartNumberMarker>3</NextPartNumberMarker>
  <IsTruncated>true</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <ETag>"etag-1"</ETag>
  </Part>
  <Part>
    <PartNumber>2</PartNumber>
    <ETag>etag-2</ETag>
  </Part>
</ListPartsResult>`;

  const result = parseListPartsXml(xml);
  t.deepEqual(result.parts, [
    { partNumber: 1, etag: 'etag-1' },
    { partNumber: 2, etag: 'etag-2' },
  ]);
  t.true(result.isTruncated);
  t.is(result.nextPartNumberMarker, '3');
});

test('parseListPartsXml handles single part', t => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult>
  <Bucket>test</Bucket>
  <Key>key</Key>
  <UploadId>upload-id</UploadId>
  <IsTruncated>false</IsTruncated>
  <Part>
    <PartNumber>5</PartNumber>
    <ETag>"etag-5"</ETag>
  </Part>
</ListPartsResult>`;

  const result = parseListPartsXml(xml);
  t.deepEqual(result.parts, [{ partNumber: 5, etag: 'etag-5' }]);
  t.false(result.isTruncated);
  t.is(result.nextPartNumberMarker, undefined);
});
