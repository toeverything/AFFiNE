import { TldrawApp } from '~state';
import oldDoc from '~test/documents/old-doc';
import oldDoc2 from '~test/documents/old-doc-2';
import type { TDDocument } from '~types';

describe('When migrating bindings', () => {
    it('migrates a document without a version', () => {
        new TldrawApp().loadDocument(oldDoc as unknown as TDDocument);
    });

    it('migrates a document with an older version', () => {
        const app = new TldrawApp().loadDocument(
            oldDoc2 as unknown as TDDocument
        );
        expect(
            app.getShape('d7ab0a49-3cb3-43ae-3d83-f5cf2f4a510a').style.color
        ).toBe('black');
    });
});
