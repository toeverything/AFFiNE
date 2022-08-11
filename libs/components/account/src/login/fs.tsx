/* eslint-disable filename-rules/match */
import { useEffect, useMemo } from 'react';

import { LogoIcon } from '@toeverything/components/icons';
import { MuiButton } from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import { useLocalTrigger } from '@toeverything/datasource/state';

const cleanupWorkspace = (workspace: string) =>
    new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(workspace);
        req.addEventListener('error', e => reject(e));
        req.addEventListener('blocked', e => reject(e));
        req.addEventListener('upgradeneeded', e => reject(e));
        req.addEventListener('success', e => resolve(e));
    });

const requestPermission = async (workspace: string) => {
    await cleanupWorkspace(workspace);
    const dirHandler = await window.showDirectoryPicker({
        id: 'AFFiNE_' + workspace,
        mode: 'readwrite',
        startIn: 'documents',
    });
    const fileHandle = await dirHandler.getFileHandle('affine.db', {
        create: true,
    });
    const file = await fileHandle.getFile();
    const initialData = new Uint8Array(await file.arrayBuffer());

    const exporter = async (contents: Uint8Array) => {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(contents);
            await writable.close();
        } catch (e) {
            console.log(e);
        }
    };

    await services.api.editorBlock.setupDataExporter(
        workspace,
        new Uint8Array(initialData),
        exporter
    );
};

export const FileSystem = (props: { onError: () => void }) => {
    const onSelected = useLocalTrigger();

    const apiSupported = useMemo(() => {
        try {
            return 'showOpenFilePicker' in window;
        } catch (e) {
            return false;
        }
    }, []);

    useEffect(() => {
        if (process.env['NX_E2E']) {
            onSelected();
        }
    }, []);

    return (
        <MuiButton
            variant="outlined"
            fullWidth
            style={{ textTransform: 'none' }}
            startIcon={<LogoIcon />}
            onClick={async () => {
                try {
                    if (apiSupported) {
                        await requestPermission('AFFiNE');
                        onSelected();
                    } else {
                        onSelected();
                    }
                } catch (e) {
                    props.onError();
                }
            }}
        >
            {apiSupported ? 'Sync to Disk' : 'Try Live Demo'}
        </MuiButton>
    );
};
