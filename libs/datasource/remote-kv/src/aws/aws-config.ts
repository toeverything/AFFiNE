const bucketRegion = 'us-east-1';
const identityPoolId = 'us-east-1:a03b5510-f924-4f55-94f6-ed7fa9aeebca';
const bucketName = 'affine-uploads';
const folderName = 'mvp';

export const keyCreator = (fileName: string) =>
    `${encodeURIComponent(folderName)}/${fileName}`;

export { bucketRegion, identityPoolId, bucketName, folderName };
