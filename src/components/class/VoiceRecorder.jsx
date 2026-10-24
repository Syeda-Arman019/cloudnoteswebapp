/**
 * VoiceRecorder — asynchronous voice messages for the class chat.
 *
 * Flow: explicit Record tap → browser mic permission → live duration →
 * Stop → preview (play/pause) → Send (uploads as an audio attachment) or
 * Discard. The microphone is released the moment recording stops, on
 * cancel, and on unmount — it is never left open in the background.
 *
 * Unsupported browsers (no MediaRecorder or getUserMedia) get an honest
 * message instead of a dead button. Secure context (HTTPS or localhost) is
 * required by the browser for microphone access; denial is surfaced as a
 * clear, actionable error.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Play, Pause, Send, Square, Trash2 } from 'lucide-react';
import Button from '@/components/common/Button';

const MAX_RECORDING_SECONDS = 300; // 5 minutes — matches the server cap story
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      /* keep probing */
    }
  }
  return ''; // let the browser choose its default
}

function extensionFor(mimeType) {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'webm';
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function VoiceRecorder({ onSend, onCancel, disabled = false }) {
  const [state, setState] = useState('idle'); // idle | requesting | recording | preview | uploading
  const [error, setError] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  // Incremented whenever a pending getUserMedia must be abandoned (cancel,
  // discard, unmount) so a late-resolving permission grant is released
  // immediately instead of leaving the microphone open.
  const requestIdRef = useRef(0);

  const supported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined';

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Hard cleanup on unmount: never keep a live microphone.
  useEffect(
    () => () => {
      requestIdRef.current += 1; // abandon any still-pending permission request
      stopTimer();
      releaseStream();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      try {
        recorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
      } catch {
        /* already stopped */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const startRecording = async () => {
    setError(null);
    setState('requesting');
    const requestId = ++requestIdRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (requestId !== requestIdRef.current) {
        // Cancelled (or unmounted) while the permission prompt was open —
        // release the microphone immediately, never start recording.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const collected = new Blob(chunksRef.current, { type });
        setBlob(collected);
        setAudioUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(collected);
        });
        setState('preview');
      });
      recorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setState('recording');
      timerRef.current = window.setInterval(() => {
        setSeconds((current) => {
          const next = current + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            // Auto-stop at the limit — stop() will flip us to preview.
            recorderRef.current?.state === 'recording' && recorderRef.current.stop();
            stopTimer();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      releaseStream();
      setState('idle');
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        setError(
          'Microphone access was denied. Allow the microphone in your browser settings and try again.'
        );
      } else if (err.name === 'NotFoundError') {
        setError('No microphone was found on this device.');
      } else {
        setError('Could not start recording. Please try again.');
      }
    }
  };

  const stopRecording = () => {
    stopTimer();
    try {
      recorderRef.current?.stop();
    } catch {
      /* already stopped */
    }
    releaseStream();
  };

  const discard = () => {
    requestIdRef.current += 1; // abort a still-pending permission request
    stopTimer();
    releaseStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setBlob(null);
    setSeconds(0);
    setIsPlaying(false);
    setError(null);
    setState('idle');
    onCancel?.();
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setError('Playback failed — try downloading on another browser.'));
    } else {
      audio.pause();
    }
  };

  const send = async () => {
    if (!blob) return;
    setState('uploading');
    setUploadProgress(0);
    try {
      const filename = `voice-${Date.now()}.${extensionFor(blob.type)}`;
      const file = new File([blob], filename, { type: blob.type || 'audio/webm' });
      await onSend(file, {
        onProgress: (percent) => setUploadProgress(percent),
      });
      discard();
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
      setState('preview');
    } finally {
      setUploadProgress(null);
    }
  };

  if (!supported) {
    return (
      <div className="voice-unsupported" role="note">
        Voice messages are not supported in this browser. Try Chrome, Edge or
        Firefox on desktop — or send a text message instead.
      </div>
    );
  }

  if (state === 'recording' || state === 'requesting') {
    return (
      <div className="voice-panel is-recording" role="status" aria-live="polite">
        <span className="voice-dot" aria-hidden="true" />
        <span className="voice-duration">
          {state === 'requesting' ? 'Requesting microphone…' : formatDuration(seconds)}
        </span>
        <div className="voice-actions">
          <Button
            variant="dangerSoft"
            size="sm"
            icon={<Square size={14} />}
            onClick={stopRecording}
            disabled={state === 'requesting'}
          >
            Stop
          </Button>
          {/* Cancel stays enabled during the permission prompt so the user is
              never stuck behind an unanswered (or hung) microphone request. */}
          <Button variant="ghost" size="sm" onClick={discard}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'preview' || state === 'uploading') {
    return (
      <div className="voice-panel is-preview">
        <button
          type="button"
          className="btn-icon voice-play"
          onClick={togglePlayback}
          aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <audio
          ref={audioRef}
          src={audioUrl || undefined}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          preload="metadata"
        />
        <span className="voice-duration">{formatDuration(seconds)}</span>
        {state === 'uploading' ? (
          <span className="voice-upload-status">
            Sending… {uploadProgress !== null ? `${uploadProgress}%` : ''}
          </span>
        ) : (
          <div className="voice-actions">
            <Button
              size="sm"
              icon={<Send size={14} />}
              onClick={send}
              loading={state === 'uploading'}
              disabled={disabled}
            >
              Send voice message
            </Button>
            <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={discard}>
              Discard
            </Button>
          </div>
        )}
        {error && (
          <p className="voice-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="voice-idle">
      <Button
        variant="secondary"
        size="sm"
        icon={<Mic size={15} />}
        onClick={startRecording}
        disabled={disabled}
      >
        Record voice
      </Button>
      {error && (
        <p className="voice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
