import AWSAttachment from './aws/aws-attachment';

const PLATFORM_CONFIG = {
    AWS_S3: 'aws_s3', // key replace with uuid
};

const PLATFORM = {
    [PLATFORM_CONFIG.AWS_S3]: AWSAttachment,
};

export class RemoteKvService {
    readonly #case;

    constructor(token?: string, platform = PLATFORM_CONFIG.AWS_S3) {
        this.#case = new PLATFORM[platform](token);
    }

    get instance() {
        return this.#case;
    }
}
