import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useSelector } from 'react-redux';
import { selectSttEnabled } from '../redux/slices/userSettingsSlice';

const API_BASE = ''; // Same origin

/**
 * Hook for Speech-to-Text (push-to-talk recording).
 *
 * Press-and-hold flow:
 * 1. User presses mic button → startRecording()
 * 2. User releases mic button → stopRecording() → sends audio to POST /api/stt
 * 3. Server returns { text, language }
 * 4. Text is provided via onTranscription callback
 *
 * Cancel flow:
 * - Tap mic while recording → cancelRecording() → stops without sending
 *
 * Web: AudioContext → raw PCM → WAV blob (whisper.cpp only supports flac, mp3, ogg, wav)
 * Mobile: expo-av Audio.Recording → WAV (PCM)
 */
export function useStt(onTranscription?: (text: string) => void) {
  const sttEnabled = useSelector(selectSttEnabled);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<any>(null);

  // Web-specific refs for AudioContext-based PCM capture
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(16000);

  // Clear error when recording starts
  const clearError = useCallback(() => setError(null), []);

  const transcribe = useCallback(
    async (audioBlob: Blob, mimeType: string) => {
      try {
        const ext = mimeTypeToExt(mimeType);
        const form = new FormData();
        form.append('audio', audioBlob, `recording.${ext}`);

        const res = await fetch(`${API_BASE}/api/stt`, {
          method: 'POST',
          body: form,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `STT failed: ${res.status}`);
        }

        const data = await res.json();
        if (data.text && onTranscription) {
          onTranscription(data.text);
        }
        return data.text as string;
      } catch (err: any) {
        console.warn('[stt] Transcription failed:', err);
        setError(err.message || 'Transcription failed');
        throw err;
      }
    },
    [onTranscription],
  );

  // --- Web: AudioContext → raw PCM → WAV ---
  const startRecordingWeb = useCallback(async () => {
    try {
      clearError();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx({ sampleRate: 16000 });
      sampleRateRef.current = audioContext.sampleRate;
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // createScriptProcessor is deprecated but universally supported;
      // AudioWorklet requires a separate JS file which is impractical here.
      const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
      scriptNodeRef.current = scriptNode;

      pcmChunksRef.current = [];

      scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
        const channelData = e.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(channelData));
      };

      source.connect(scriptNode);
      // Must connect to destination or onaudioprocess won't fire in some browsers
      scriptNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err: any) {
      console.warn('[stt] Failed to start recording (web):', err);
      if (
        err.name === 'NotAllowedError' ||
        err.message?.includes('Permission') ||
        err.message?.includes('permission')
      ) {
        setError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        setError(err.message || 'Failed to start recording');
      }
      setIsRecording(false);
    }
  }, [clearError]);

  const stopRecordingWeb = useCallback(() => {
    const scriptNode = scriptNodeRef.current;
    const audioContext = audioContextRef.current;
    const stream = streamRef.current;

    // Disconnect the audio graph
    if (scriptNode) {
      scriptNode.disconnect();
      scriptNode.onaudioprocess = null;
      scriptNodeRef.current = null;
    }

    // Stop the mic stream
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Build WAV blob from captured PCM chunks
    const wavBlob = pcmToWavBlob(pcmChunksRef.current, sampleRateRef.current);
    pcmChunksRef.current = [];

    // Close the AudioContext (async, fire-and-forget)
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (wavBlob) {
      transcribe(wavBlob, 'audio/wav');
    } else {
      setIsRecording(false);
    }
  }, [transcribe]);

  const cancelRecordingWeb = useCallback(() => {
    const scriptNode = scriptNodeRef.current;
    const audioContext = audioContextRef.current;
    const stream = streamRef.current;

    if (scriptNode) {
      scriptNode.disconnect();
      scriptNode.onaudioprocess = null;
      scriptNodeRef.current = null;
    }

    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    pcmChunksRef.current = [];

    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
      audioContextRef.current = null;
    }

    setIsRecording(false);
  }, []);

  // --- Mobile: expo-av ---
  const startRecordingMobile = useCallback(async () => {
    try {
      clearError();
      const { Audio } = require('expo-av');

      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone access denied. Please allow microphone access in your device settings.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Platform.OS === 'ios'
          ? Audio.RecordingOptionsPresets.HIGH_QUALITY
          : {
              android: {
                extension: '.wav',
                outputFormat: Audio.AndroidOutputFormat.DEFAULT,
                audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
                sampleRate: 16000,
                numberOfChannels: 1,
                bitRate: 128000,
              },
              ios: {
                extension: '.wav',
                audioQuality: Audio.IOSAudioQuality.HIGH,
                sampleRate: 16000,
                numberOfChannels: 1,
                bitRate: 128000,
                linearPCMBitDepth: 16,
                linearPCMIsBigEndian: false,
                linearPCMIsFloat: false,
              },
              web: {},
            },
      );

      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err: any) {
      console.warn('[stt] Failed to start recording (mobile):', err);
      setError(err.message || 'Failed to start recording');
      setIsRecording(false);
    }
  }, [clearError]);

  const stopRecordingMobile = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) {
        setIsRecording(false);
        return;
      }

      recordingRef.current = null;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        setIsRecording(false);
        return;
      }

      // Fetch the local file and upload
      const response = await fetch(uri);
      const blob = await response.blob();
      try {
        await transcribe(blob, blob.type || 'audio/wav');
      } catch {
        // error already set by transcribe
      } finally {
        setIsRecording(false);
      }
    } catch (err: any) {
      console.warn('[stt] Failed to stop recording (mobile):', err);
      setError(err.message || 'Failed to stop recording');
      setIsRecording(false);
    }
  }, [transcribe]);

  const cancelRecordingMobile = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (recording) {
        recordingRef.current = null;
        await recording.stopAndUnloadAsync();
      }
    } catch (err) {
      console.warn('[stt] Failed to cancel recording (mobile):', err);
    } finally {
      setIsRecording(false);
    }
  }, []);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      // Web cleanup
      if (Platform.OS === 'web') {
        scriptNodeRef.current?.disconnect();
        scriptNodeRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
        pcmChunksRef.current = [];
      }
      // Mobile cleanup
      const recording = recordingRef.current;
      if (recording) {
        recording.stopAndUnloadAsync?.().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  // --- Public API ---
  const startRecording = useCallback(() => {
    if (!sttEnabled) return;
    if (Platform.OS === 'web') {
      startRecordingWeb();
    } else {
      startRecordingMobile();
    }
  }, [sttEnabled, startRecordingWeb, startRecordingMobile]);

  const stopRecording = useCallback(() => {
    if (Platform.OS === 'web') {
      stopRecordingWeb();
    } else {
      stopRecordingMobile();
    }
  }, [stopRecordingWeb, stopRecordingMobile]);

  const cancelRecording = useCallback(() => {
    if (Platform.OS === 'web') {
      cancelRecordingWeb();
    } else {
      cancelRecordingMobile();
    }
  }, [cancelRecordingWeb, cancelRecordingMobile]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      cancelRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, cancelRecording]);

  return {
    isRecording,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
    enabled: sttEnabled,
  };
}

// --- WAV encoding helpers ---

/**
 * Encode an array of Float32Array PCM chunks into a 16-bit mono WAV Blob.
 */
function pcmToWavBlob(chunks: Float32Array[], sampleRate: number): Blob | null {
  // Flatten chunks into one buffer
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  if (totalLength === 0) return null;

  const buffer = new ArrayBuffer(44 + totalLength * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalLength * 2, true); // file size - 8
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size (PCM)
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, 1, true); // channels (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, totalLength * 2, true);

  // Write PCM samples (Float32 [-1,1] → Int16)
  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Map a MIME type to a common file extension for the upload. */
function mimeTypeToExt(mime: string): string {
  if (mime.includes('wav') || mime.includes('wave')) return 'wav';
  if (mime.includes('ogg') || mime.includes('opus')) return 'ogg';
  if (mime.includes('mp3') || mime.includes('mpeg')) return 'mp3';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  return 'wav';
}
