import { type Container, createIdentifier } from '@blocksuite/global/di';
import { type BlockStdScope, StdIdentifier } from '@blocksuite/std';
import { type BlockModel, Extension } from '@blocksuite/store';

import { DocModeProvider } from '../doc-mode-service';
import type {
  CitationEvents,
  CitationEventType,
} from '../telemetry-service/citation';
import { TelemetryProvider } from '../telemetry-service/telemetry-service';

const CitationEventTypeMap = {
  Hover: 'AICitationHoverSource',
  Expand: 'AICitationExpandSource',
  Delete: 'AICitationDelete',
  Edit: 'AICitationEdit',
} as const;

type EventType = keyof typeof CitationEventTypeMap;

type EventTypeMapping = {
  [K in EventType]: CitationEventType;
};

export interface CitationViewService {
  /**
   * Tracks citation-related events
   * @param type - The type of citation event to track
   * @param properties - The properties of the event
   */
  trackEvent<T extends EventType>(
    type: T,
    properties?: CitationEvents[EventTypeMapping[T]]
  ): void;
  /**
   * Checks if the model is a citation model
   * @param model - The model to check
   * @returns True if the model is a citation model, false otherwise
   */
  isCitationModel(model: BlockModel): boolean;
}

export const CitationProvider =
  createIdentifier<CitationViewService>('CitationService');

export class CitationService extends Extension implements CitationViewService {
  constructor(private readonly std: BlockStdScope) {
    super();
  }

  static override setup(di: Container) {
    di.addImpl(CitationProvider, CitationService, [StdIdentifier]);
  }

  get docModeService() {
    return this.std.getOptional(DocModeProvider);
  }

  get telemetryService() {
    return this.std.getOptional(TelemetryProvider);
  }

  isCitationModel = (model: BlockModel) => {
    return (
      'footnoteIdentifier' in model.props &&
      !!model.props.footnoteIdentifier &&
      'style' in model.props &&
      model.props.style === 'citation'
    );
  };

  trackEvent<T extends EventType>(
    type: T,
    properties?: CitationEvents[EventTypeMapping[T]]
  ) {
    const editorMode = this.docModeService?.getEditorMode() ?? 'page';
    this.telemetryService?.track(CitationEventTypeMap[type], {
      page: editorMode === 'page' ? 'doc editor' : 'whiteboard editor',
      module: 'AI Result',
      control: 'Source',
      ...properties,
    });
  }
}
