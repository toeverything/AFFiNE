/* eslint-disable filename-rules/match */
import { useCallback, useMemo, useState } from 'react';

import { IconButton, MuiSnackbar, styled } from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import { useLocalTrigger } from '@toeverything/datasource/state';
import { CloseIcon } from '@toeverything/components/common';

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
    // @ts-ignore
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

const StyledFileSystem = styled('div')<{ disabled?: boolean }>({
    padding: '10px 12px',
    fontWeight: 600,
    fontSize: '14px',
    color: '#3E6FDB',
    textTransform: 'uppercase',
    cursor: 'pointer',
    '&:hover': {
        background: '#F5F7F8',
        borderRadius: '5px',
    },
});

export const fsApiSupported = () => {
    try {
        return 'showOpenFilePicker' in window;
    } catch (e) {
        return false;
    }
};

export const FileSystem = () => {
    const [selected, onSelected] = useLocalTrigger();
    const [error, setError] = useState(false);

    const onError = useCallback(() => {
        setError(true);
        setTimeout(() => setError(false), 3000);
    }, []);

    const apiSupported = useMemo(() => fsApiSupported(), []);

    if (apiSupported && !selected) {
        return (
            <>
                <MuiSnackbar
                    anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                    open={error}
                    message="Request File Permission failed, please check if you have permission"
                    sx={{ marginTop: '3em' }}
                    action={
                        <IconButton
                            aria-label="close"
                            onClick={() => setError(false)}
                        >
                            <CloseIcon />
                        </IconButton>
                    }
                />
                <StyledFileSystem
                    onClick={async () => {
                        try {
                            await requestPermission('AFFiNE');
                            onSelected();
                        } catch (e) {
                            onError();
                        }
                    }}
                >
                    Sync to Disk
                </StyledFileSystem>
            </>
        );
    }
    return null;
};
