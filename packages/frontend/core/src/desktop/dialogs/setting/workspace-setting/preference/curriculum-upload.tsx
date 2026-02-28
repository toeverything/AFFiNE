import { toast } from '@affine/component';
import { Button } from '@affine/component/ui/button';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import { GraphQLService } from '@affine/core/modules/cloud';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { uploadCurriculumMutation } from '@affine/graphql';
import { DownloadIcon, UploadIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback, useRef, useState, useEffect } from 'react';

interface CurriculumDocument {
  filename: string;
  key: string;
  size: number;
  mime: string;
  createdAt: string;
  downloadUrl: string;
}

export const CurriculumUploadPanel = () => {
  const workspace = useService(WorkspaceService).workspace;
  const server = workspace?.scope.get(WorkspaceServerService).server;
  const workspaceInfo = useWorkspaceInfo(workspace);
  const graphql = useService(GraphQLService);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<CurriculumDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getCurriculumDocumentsQuery = {
    query: `query getCurriculumDocuments($workspaceId: String!) {
      workspace(id: $workspaceId) {
        id
        curriculumDocuments {
          filename
          key
          size
          mime
          createdAt
          downloadUrl
        }
      }
    }`,
    op: 'getCurriculumDocuments',
  } as any;

  const loadDocuments = useCallback(async () => {
    if (!workspace?.id) return;

    try {
      const result = await graphql.gql({
        query: getCurriculumDocumentsQuery,
        variables: {
          workspaceId: workspace.id,
        },
      });

      setDocuments(result.workspace?.curriculumDocuments || []);
    } catch (error) {
      console.error('Failed to load curriculum documents:', error);
    } finally {
      setIsLoading(false);
    }
  }, [graphql, workspace?.id]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    console.log('CurriculumUploadPanel mounted', {
      workspaceId: workspace?.id,
      server: !!server,
    });
  }, [workspace?.id, server]);

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !workspace?.id) return;

      setIsUploading(true);
      try {
        await graphql.gql({
          query: uploadCurriculumMutation,
          variables: {
            workspaceId: workspace.id,
            curriculum: file,
          },
        } as any);
        toast('Curriculum uploaded successfully!');
        // Reload documents after upload
        loadDocuments();
      } catch (error) {
        console.error('Upload failed:', error);
        toast('Failed to upload curriculum');
      } finally {
        setIsUploading(false);
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [graphql, workspace?.id, loadDocuments]
  );

  const handleDownload = useCallback((downloadUrl: string) => {
    window.open(downloadUrl, '_blank');
  }, []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Button
          onClick={handleClick}
          disabled={isUploading}
          prefix={<UploadIcon />}
        >
          {isUploading ? 'Uploading...' : 'Upload Curriculum'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600' }}>
          Uploaded Documents
        </h4>
        {isLoading ? (
          <div style={{ padding: '8px', color: '#666' }}>Loading...</div>
        ) : documents.length === 0 ? (
          <div style={{ padding: '8px', color: '#666' }}>No documents uploaded yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {documents.map((doc) => (
              <div
                key={doc.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  backgroundColor: '#fafafa',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                    {doc.filename}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {formatFileSize(doc.size)} • {formatDate(doc.createdAt)}
                  </div>
                </div>
                <Button
                  size="small"
                  onClick={() => handleDownload(doc.downloadUrl)}
                  prefix={<DownloadIcon />}
                >
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};