import { Service } from '@toeverything/infra';

import type { CacheStorage, GlobalStateService } from '../../storage';

const AI_DRAFTS_KEY = 'AIDrafts';
const AI_DRAFT_FILES_PREFIX = 'AIDraftFile:';

export interface CacheFile {
  name: string;
  size: number;
  type: string;
  cacheKey: string;
}

export interface AIDraftState {
  input: string;
  quote: string;
  markdown: string;
  images: File[];
}

export interface AIDraftGlobal {
  input: string;
  quote: string;
  markdown: string;
  images: CacheFile[];
}

const DEFAULT_VALUE = {
  input: '',
  quote: '',
  markdown: '',
  images: [],
};

export class AIDraftService extends Service {
  private state: AIDraftState | null = null;

  constructor(
    private readonly globalStateService: GlobalStateService,
    private readonly cacheStorage: CacheStorage
  ) {
    super();
  }

  setDraft = async (data: Partial<AIDraftState>) => {
    const state = await this.getState();
    const newState = {
      ...state,
      ...data,
    };
    this.state = newState;
    await this.saveDraft(newState);
  };

  getDraft = async () => {
    const state = await this.getState();
    return state;
  };

  private readonly saveDraft = async (state: AIDraftState) => {
    const draft =
      this.globalStateService.globalState.get<AIDraftGlobal>(AI_DRAFTS_KEY) ||
      DEFAULT_VALUE;

    const addedImages = state.images.filter(image => {
      return !draft.images.some(cacheImage => {
        return cacheImage.cacheKey === this.getCacheKey(image);
      });
    });
    const removedImages = draft.images.filter(cacheImage => {
      return !state.images.some(image => {
        return cacheImage.cacheKey === this.getCacheKey(image);
      });
    });

    const cacheKeys = removedImages.map(image => image.cacheKey);
    await this.removeFilesFromCache(cacheKeys);
    await this.addFilesToCache(addedImages);

    this.globalStateService.globalState.set<AIDraftGlobal>(AI_DRAFTS_KEY, {
      input: state.input,
      quote: state.quote,
      markdown: state.markdown,
      images: state.images.map(image => {
        return {
          name: image.name,
          size: image.size,
          type: image.type,
          cacheKey: this.getCacheKey(image),
        };
      }),
    });
  };

  private readonly initState = async () => {
    if (this.state) {
      return;
    }
    const draft =
      this.globalStateService.globalState.get<AIDraftGlobal>(AI_DRAFTS_KEY);
    if (draft) {
      const images = await this.restoreFilesFromData(draft.images);
      this.state = {
        input: draft.input,
        quote: draft.quote,
        markdown: draft.markdown,
        images,
      };
    } else {
      this.state = DEFAULT_VALUE;
    }
  };

  private readonly getState = async () => {
    await this.initState();
    return this.state as AIDraftState;
  };

  private readonly getCacheKey = (file: File) => {
    return AI_DRAFT_FILES_PREFIX + file.name + file.size;
  };

  private readonly addFilesToCache = async (files: File[]) => {
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const cacheKey = this.getCacheKey(file);
      await this.cacheStorage.set(cacheKey, arrayBuffer);
    }
  };

  private readonly removeFilesFromCache = async (cacheKeys: string[]) => {
    for (const cacheKey of cacheKeys) {
      await this.cacheStorage.del(cacheKey);
    }
  };

  private readonly restoreFilesFromData = async (
    cacheFiles: CacheFile[]
  ): Promise<File[]> => {
    const files: File[] = [];
    for (const cacheFile of cacheFiles) {
      try {
        const arrayBuffer = await this.cacheStorage.get<ArrayBuffer>(
          cacheFile.cacheKey
        );
        if (arrayBuffer) {
          const file = new File([arrayBuffer], cacheFile.name, {
            type: cacheFile.type,
          });
          files.push(file);
        }
      } catch (error) {
        console.warn(`Failed to restore file ${cacheFile.name}:`, error);
      }
    }
    return files;
  };
}
