/* eslint-disable filename-rules/match */
import { useEffect, useState } from 'react';

import { LogoImg } from '@toeverything/components/common';
import {
    MuiButton,
    MuiBox,
    MuiGrid,
    MuiSnackbar,
} from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import { useLocalTrigger } from '@toeverything/datasource/state';

import { Error } from './../error';

const requestPermission = async (workspace: string) => {
    indexedDB.deleteDatabase(workspace);
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

export const FileSystem = () => {
    const onSelected = useLocalTrigger();
    const [error, setError] = useState(false);

    useEffect(() => {
        if (process.env['NX_E2E']) {
            onSelected();
        }
    }, []);

    return (
        <MuiGrid container>
            <MuiSnackbar
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                open={error}
                message="Login failed, please check if you have permission"
            />
            <MuiGrid item xs={8}>
                <Error
                    title="Welcome to AFFiNE"
                    subTitle="blocks of knowledge to power your team"
                    action1Text="Login &nbsp; or &nbsp; Register"
                />
            </MuiGrid>

            <MuiGrid item xs={4}>
                <MuiBox
                    onClick={async () => {
                        try {
                            await requestPermission('AFFiNE');
                            onSelected();
                        } catch (e) {
                            setError(true);
                            onSelected();
                            setTimeout(() => setError(false), 3000);
                        }
                    }}
                    style={{
                        textAlign: 'center',
                        width: '300px',
                        margin: '300px  auto 20px auto',
                    }}
                    sx={{ mt: 1 }}
                >
                    <LogoImg
                        style={{
                            width: '100px',
                        }}
                    />

                    <MuiButton
                        variant="outlined"
                        fullWidth
                        style={{ textTransform: 'none' }}
                    >
                        Sync to Disk
                    </MuiButton>
                </MuiBox>
            </MuiGrid>
        </MuiGrid>
    );
};
