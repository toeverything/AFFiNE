class Clip {
    private mime_type: any;
    private data: any;

    constructor(mimeType: any, data: any) {
        this.mime_type = mimeType;
        this.data = data;
    }

    getMimeType() {
        return this.mime_type;
    }

    getData() {
        return this.data;
    }

    hasData() {
        return this.data !== null && this.data !== undefined;
    }
}

export { Clip };
