## Attachment module documentation

### describe

The attachment system currently provides AWS S3 object storage service, using the default IAM account for read and write operations;

###Instructions for use

**Initialize attachment system**

```javascript
// Initialize the accessory system, the platorm configuration is as follows, for reference
const PLATFORM_CONFIG = {
    AWSS3: 'awss3', // key replace with uuid
    ALIYUN: 'ailiyun',
};

// It is recommended not to pass the platform type for initialization, AWS S3 is used by default
import { upload, multipartUpload } from '@toeverything/components/attachment';
```

**Instance methods**

_In the function description, if "batch" is not marked, the default is a single file operation; _

-   upload: file upload

    -   Type definition

        ```typescript
        type upload = (file: File) => Promise<Error | Url>;
        ```

    -   Usage example

        ```javascript
        const onChange = async info => {
            const { file } = info;
            const url = await upload(file.originFileObj);
            console.log(url);
        };

        // or
        const onChange = async info => {
            const { file } = info;
            const [err, url] = await toAsync(upload(file.originFileObj));

            if (err) {
                return;
            }

            console.log(url);
        };
        ```

-   multipartUpload: file upload in parts

    -   Type definition

        ```typescript
        type multipartUpload = (file: File) => Promise<Error | Url>;
        ```

    -   Usage example

        ```javascript
        const onChange = async info => {
            const { file } = info;
            const url = await multipartUpload(file.originFileObj);
            console.log(url);
        };
        ```

-   batchUpload: **batch** upload

    -   Type definition

        ```typescript
        interface data {
            success: Array<{ name: string; url: string }>;
            failed: Array<{ name: string; reason: string }>;
        }

        type batchUpload = (fileList: File[]) => Promise<Error | data>;
        ```

    -   Usage example

        ```javascript
        const onChange = async info => {
            const fileList = info.fileList.map(file => file.originFileObj);
            const { success } = await batchUpload(fileList);
            const urls = success.map(item => item.url);
        };
        ```

-   download: file download

    -   Type definition

        ```typescript
        type download = (fileName: string) => Promise<Error | true>;
        ```

    -   Usage example

        ```javascript
        const onChange = async fileName => {
            // browser download
            await download(fileName);
        };
        ```

-   recovery: file deletion

    -   Type definition

        ```typescript
        type recovery = (fileName: string) => Promise<Error | true>;
        ```

    -   Usage example

        ```javascript
        const onChange = async fileName => {
            await recovery(fileName);
        };
        ```
