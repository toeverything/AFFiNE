/**
 * Attachment block audio media.
 * blockId/docId/workspaceId are used to identify the source of the media
 * to control the exclusivity playback state of audio across the whole application.
 */
export interface AttachmentBlockAudioMedia {
  blobId: string; // aka sourceId
  blockId: string;
  docId: string;
  workspaceId: string;
}

export interface AudioMediaDescriptor {
  key: AudioMediaKey;
  tabId: string | null;
  name: string;
  size: number;
  blobId: string; // aka sourceId
}

// workspaceId/docId/blockId/blobId
export type AudioMediaKey = `${string}/${string}/${string}/${string}`;

export const attachmentBlockAudioMediaKey = (
  media: AttachmentBlockAudioMedia
): AudioMediaKey => {
  return `${media.workspaceId}/${media.docId}/${media.blockId}/${media.blobId}`;
};

export const parseAudioMediaKey = (
  key: AudioMediaKey
): AttachmentBlockAudioMedia => {
  const [workspaceId, docId, blockId, blobId] = key.split('/');
  return {
    workspaceId,
    docId,
    blockId,
    blobId,
  };
};

type State = 'idle' | 'playing' | 'paused' | 'stopped';

export interface MediaStats {
  key: AudioMediaKey;
  tabId: string | null;
  duration: number;
  name: string;
  size: number;
  waveform: number[]; // for drawing waveform, maxmium of 1000 samples
}

export interface PlaybackState {
  key: AudioMediaKey;
  tabId: string | null;
  state: State;
  /**
   * Whenever the user seek the media, the startSeekOffset will be updated
   */
  seekOffset: number;
  /**
   * Whenever the media state is updated.
   * the updateTime will be updated. It is in milliseconds (unix timestamp).
   * The current playback position (0-based, in seconds) is calculated by `seekOffset + (Date.now() - updateTime) / 1000 * rate`
   */
  updateTime: number;
  /**
   * the playback rate
   */
  playbackRate: number;
}
