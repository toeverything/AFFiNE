import { type Framework } from '@toeverything/infra';

import { DocScope, DocService } from '../doc';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { Editor } from './entities/editor';
import { EditorScope } from './scopes/editor';
import { EditorService } from './services/editor';
import { EditorsService } from './services/editors';

export { Editor } from './entities/editor';
export { EditorScope } from './scopes/editor';
export { EditorService } from './services/editor';
export { EditorsService } from './services/editors';
export type { EditorSelector } from './types';

export function configureEditorModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .scope(DocScope)
    .service(EditorsService)
    .entity(Editor, [DocService, WorkspaceService])
    .scope(EditorScope)
    .service(EditorService, [EditorScope]);
}
