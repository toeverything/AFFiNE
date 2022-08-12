import type { Credentials } from 'aws-sdk';
import * as AWS from 'aws-sdk';
import type { ManagedUpload } from 'aws-sdk/lib/s3/managed_upload';
import { saveAs } from 'file-saver';

import { MESSAGE_INFO } from '../constant/message-info';
import toAsync from '../utils/to-async';
import {
    bucketName,
    bucketRegion,
    folderName,
    identityPoolId,
    keyCreator,
} from './aws-config';

export default class AwsAttachment {
    readonly #s3;

    constructor(token?: string) {
        if (token) {
            AWS.config.region = bucketRegion;
            AWS.config.credentials = new AWS.CognitoIdentityCredentials({
                IdentityPoolId: identityPoolId,
                WebIdentityToken: token,
            });

            /**
             * get credentials，used when uploading from the server
             */
            (AWS.config.credentials as Credentials).get(err => {
                if (err) {
                    throw err;
                }

                // console.log('authing:', AWS.config.credentials);
            });

            this.#s3 = new AWS.S3({
                apiVersion: '2006-03-01',
                params: { Bucket: bucketName },
            });
            // this.#s3 = new AWS.S3Client({
            //     region: bucketRegion,
            //     credentials: fromCognitoIdentityPool({
            //         clientConfig: { region: bucketRegion }, // Configure the underlying CognitoIdentityClient.
            //         identityPoolId: identityPoolId,
            //         logins: {
            //             'affine.us.authing.co/oidc/': token
            //         }
            //     })
            // });
        } else {
            throw new Error(MESSAGE_INFO.NO_AUTH.FAILURE);
        }
    }

    /**
     * upload
     * @param file
     * @returns {Promise<unknown>}
     */
    upload = (file: File) => {
        const params = {
            Bucket: bucketName,
            Key: `${encodeURIComponent(folderName)}/${file.name}`,
            Body: file,
        };

        return new Promise((resolve, reject) => {
            this.#s3.upload(
                params,
                (err: Error, data: ManagedUpload.SendData) => {
                    if (err) {
                        return reject(`${MESSAGE_INFO.UPLOAD.FAILURE}: ${err}`);
                    }

                    resolve(data.Location);
                }
            );
        });
    };

    // multipart upload
    multipartUpload = (file: File): Promise<unknown> => {
        const upload = new AWS.S3.ManagedUpload({
            params: {
                Bucket: bucketName,
                Key: keyCreator(file.name),
                Body: file,
            },
        });

        return new Promise((resolve, reject) => {
            upload.promise().then(
                data => {
                    resolve(data.Location);
                },
                (err: Error) => {
                    reject(`${MESSAGE_INFO.UPLOAD.FAILURE}: ${err}`);
                }
            );
        });
    };

    // file upload creator
    uploadPromiseCreator = (fileList: File[]): Promise<string>[] => {
        return fileList.map(file => {
            const params = {
                Bucket: bucketName,
                Key: keyCreator(file.name),
                Body: file,
            };

            return (() =>
                new Promise((resolve, reject) => {
                    this.#s3.upload(
                        params,
                        (err: Error, data: ManagedUpload.SendData) => {
                            if (err) {
                                reject(
                                    `${MESSAGE_INFO.UPLOAD.FAILURE}: ${err}`
                                );
                            }

                            resolve(data.Location);
                        }
                    );
                }))();
        });
    };

    /**
     * bath upload
     * @param fileList
     * @returns {Promise<Array<{}>>}
     */
    batchUpload = async (fileList: File[]) => {
        /**
         * file upload creator
         * @param fileList
         * @returns {*}
         */

        const handleList = this.uploadPromiseCreator(fileList);
        const [err, data_source] = await toAsync(
            Promise.allSettled(handleList)
        );

        return new Promise((resolve, reject) => {
            if (err) {
                return reject(`${MESSAGE_INFO.UPLOAD.FAILURE}: ${err}`);
            }

            const result = data_source.reduce(
                (
                    {
                        success,
                        failed,
                    }: {
                        success: Array<{ name: string; url: string }>;
                        failed: Array<{ name: string; reason: string }>;
                    },
                    current: Record<string, string>,
                    index: number
                ) => {
                    const { name } = fileList[index];
                    const { value, reason } = current;

                    value
                        ? success.push({ name, url: value })
                        : failed.push({ name, reason });

                    return { success, failed };
                },
                { success: [], failed: [] }
            );

            resolve(result);
        });
    };

    /**
     * get file object from AWS
     * @param fileName
     * @returns {Promise<unknown>}
     */
    getBuffData = (fileName: string) => {
        const params = {
            Bucket: bucketName,
            Key: keyCreator(fileName),
        };

        return new Promise((resolve, reject) => {
            this.#s3.getObject(params, (err: Error, data) => {
                if (err) {
                    return reject(`${MESSAGE_INFO.GET.FAILURE}: ${err}`);
                }

                resolve(data.Body);
            });
        });
    };

    /**
     * download file form AWS
     * @param fileName
     * @returns {Promise<unknown>}
     */
    download = async (fileName: string) => {
        const [err, buff] = await toAsync(this.getBuffData(fileName));

        return new Promise((resolve, reject) => {
            if (err) {
                return reject(`${MESSAGE_INFO.DOWNLOAD.FAILURE}: ${err}`);
            }

            // Browser download
            saveAs(new Blob([buff], { type: 'arraybuffer' }), fileName);

            resolve(true);
        });
    };

    /**
     * check object is exist on AWS
     * @param fileName
     * @returns {Promise<unknown>}
     */
    exist = (fileName: string) => {
        const params = {
            Bucket: bucketName,
            Key: keyCreator(fileName),
        };

        return new Promise((resolve, reject) => {
            this.#s3.headObject(params, (err: Error) => {
                if (err && err.name === 'NotFound') {
                    return resolve(false);
                }

                if (err) {
                    return reject(err);
                }

                resolve(true);
            });
        });
    };

    /**
     * delete file on AWS
     * @param fileName
     * @returns {Promise<unknown>}
     */
    recovery = (fileName: string) => {
        const params = {
            Bucket: bucketName,
            Key: keyCreator(fileName),
        };

        return new Promise((resolve, reject) => {
            this.#s3.deleteObject(params, (err: Error) => {
                if (err) {
                    return reject(`${MESSAGE_INFO.DELETE.FAILURE} ${err}`);
                }

                resolve(true);
            });
        });
    };
}
