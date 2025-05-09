import {
  AnimatedTranscribeIcon,
  Button,
  Tooltip,
  useConfirmModal,
} from '@affine/component';
import { AudioPlayer } from '@affine/component/ui/audio-player';
import { useEnableAI } from '@affine/core/components/hooks/affine/use-enable-ai';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useSeekTime } from '@affine/core/components/hooks/use-seek-time';
import { CurrentServerScopeProvider } from '@affine/core/components/providers/current-server-scope';
import { PublicUserLabel } from '@affine/core/modules/cloud/views/public-user';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import type { AudioAttachmentBlock } from '@affine/core/modules/media/entities/audio-attachment-block';
import { AudioAttachmentService } from '@affine/core/modules/media/services/audio-attachment';
import { Trans, useI18n } from '@affine/i18n';
import track from '@affine/track';
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AttachmentViewerProps } from '../types';
import * as styles from './audio-block.css';
import { TranscriptionBlock } from './transcription-block';

const AttachmentAudioPlayer = ({ block }: { block: AudioAttachmentBlock }) => {
  const audioMedia = block.audioMedia;
  const playbackState = useLiveData(audioMedia.playbackState$);
  const stats = useLiveData(audioMedia.stats$);
  const expanded = useLiveData(block.expanded$);
  const [preflightChecking, setPreflightChecking] = useState(false);
  const transcribing =
    useLiveData(block.transcriptionJob.transcribing$) || preflightChecking;
  const error = useLiveData(block.transcriptionJob.error$);
  const transcribed = useLiveData(block.hasTranscription$);
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);
  const confirmModal = useConfirmModal();
  const seekTime = useSeekTime(playbackState, stats.duration);

  const handlePlay = useCallback(() => {
    audioMedia?.play();
  }, [audioMedia]);

  const handlePause = useCallback(() => {
    audioMedia?.pause();
  }, [audioMedia]);

  const handleStop = useCallback(() => {
    audioMedia?.stop();
  }, [audioMedia]);

  const handleSeek = useCallback(
    (time: number) => {
      audioMedia?.seekTo(time);
    },
    [audioMedia]
  );

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      audioMedia?.setPlaybackRate(rate);
    },
    [audioMedia]
  );

  const t = useI18n();

  const enableAi = useEnableAI();

  const globalDialogService = useService(GlobalDialogService);

  const handleNotesClick = useAsyncCallback(async () => {
    if (!enableAi || transcribing) {
      return;
    }

    if (transcribed) {
      block.expanded$.setValue(!expanded);
      track.doc.editor.audioBlock.openTranscribeNotes({
        type: 'Meeting record',
        method: 'success',
        option: expanded ? 'off' : 'on',
      });
      return;
    }

    if (!block.transcriptionJob.currentUserId) {
      confirmModal.openConfirmModal({
        title: t['com.affine.ai.login-required.dialog-title'](),
        description: t['com.affine.ai.login-required.dialog-content'](),
        confirmText: t['com.affine.ai.login-required.dialog-confirm'](),
        confirmButtonOptions: {
          variant: 'primary',
        },
        cancelText: t['com.affine.ai.login-required.dialog-cancel'](),
        onConfirm: () => {
          globalDialogService.open('sign-in', {});
        },
      });
      track.doc.editor.audioBlock.openTranscribeNotes({
        type: 'Meeting record',
        method: 'not signed in',
      });
      return;
    }

    setPreflightChecking(true);
    const result = await block.transcriptionJob.preflightCheck();
    setPreflightChecking(false);
    if (result?.error === 'created-by-others') {
      confirmModal.openConfirmModal({
        title: t['com.affine.audio.transcribe.non-owner.confirm.title'](),
        description: (
          <Trans i18nKey="com.affine.audio.transcribe.non-owner.confirm.message">
            Please contact <PublicUserLabel id={result.userId} /> to upgrade AI
            rights or resend the attachment.
          </Trans>
        ),
        onCancel: false,
        confirmText: t['Confirm'](),
        confirmButtonOptions: {
          variant: 'primary',
        },
      });
      track.doc.editor.audioBlock.openTranscribeNotes({
        type: 'Meeting record',
        method: 'not owner',
      });
    } else {
      await block.transcribe();
      track.doc.editor.audioBlock.transcribeRecording({
        type: 'Meeting record',
        method: 'success',
        option: 'handle transcribing',
      });
    }
  }, [
    enableAi,
    transcribing,
    transcribed,
    block,
    expanded,
    confirmModal,
    t,
    globalDialogService,
  ]);

  const notesEntry = useMemo(() => {
    if (!enableAi) {
      return null;
    }
    const inner = (
      <Button
        variant="plain"
        prefix={
          <AnimatedTranscribeIcon
            state={transcribing ? 'transcribing' : 'idle'}
          />
        }
        size="large"
        prefixClassName={styles.notesButtonIcon}
        className={styles.notesButton}
        onClick={handleNotesClick}
      >
        {transcribing
          ? t['com.affine.audio.transcribing']()
          : t['com.affine.audio.notes']()}
      </Button>
    );
    if (transcribing) {
      return (
        <Tooltip content={t['com.affine.audio.transcribing']()}>
          {inner}
        </Tooltip>
      );
    }
    return inner;
  }, [enableAi, transcribing, handleNotesClick, t]);

  const sizeEntry = useMemo(() => {
    if (error) {
      return <div className={styles.error}>{error.message}</div>;
    }
    return block.props.props.size;
  }, [error, block.props.props.size]);

  return (
    <AudioPlayer
      name={block.props.props.name}
      size={sizeEntry}
      loading={stats.duration === 0}
      playbackState={playbackState?.state || 'idle'}
      waveform={stats.waveform}
      seekTime={seekTime}
      duration={stats.duration}
      onClick={handleClick}
      onPlay={handlePlay}
      onPause={handlePause}
      onStop={handleStop}
      onSeek={handleSeek}
      playbackRate={playbackState?.playbackRate || 1.0}
      onPlaybackRateChange={handlePlaybackRateChange}
      notesEntry={
        <CurrentServerScopeProvider>{notesEntry}</CurrentServerScopeProvider>
      }
    />
  );
};

const useAttachmentMediaBlock = (model: AttachmentBlockModel) => {
  const audioAttachmentService = useService(AudioAttachmentService);
  const [audioAttachmentBlock, setAttachmentMedia] = useState<
    AudioAttachmentBlock | undefined
  >(undefined);

  useEffect(() => {
    if (!model.props.sourceId) {
      return;
    }
    const entity = audioAttachmentService.get(model);
    if (!entity) {
      return;
    }
    const audioAttachmentBlock = entity.obj;
    setAttachmentMedia(audioAttachmentBlock);
    audioAttachmentBlock.mount();
    return () => {
      audioAttachmentBlock.unmount();
      entity.release();
    };
  }, [audioAttachmentService, model]);
  return audioAttachmentBlock;
};

export const AudioBlockEmbedded = (props: AttachmentViewerProps) => {
  const audioAttachmentBlock = useAttachmentMediaBlock(props.model);
  const transcriptionBlock = useLiveData(
    audioAttachmentBlock?.transcriptionBlock$
  );
  const expanded = useLiveData(audioAttachmentBlock?.expanded$);
  return (
    <div className={styles.root}>
      {audioAttachmentBlock && (
        <AttachmentAudioPlayer block={audioAttachmentBlock} />
      )}
      {transcriptionBlock && expanded && (
        <TranscriptionBlock block={transcriptionBlock} />
      )}
    </div>
  );
};
