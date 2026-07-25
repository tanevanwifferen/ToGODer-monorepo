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
 * Web: MediaRecorder API → WebM audio
 * Mobile: expo-av Audio.Recording → WAV (PCM)
 */
export function useStt(onTranscription?: (text: string) => void) {
  const sttEnabled = useSelector(selectSttEnabled);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingRef = useRef<any>(null);

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

  // --- Web: MediaRecorder API ---
  const startRecordingWeb = useCallback(async () => {
    try {
      clearError();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      // Try WebM with opus first, then fall back
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        try {
          await transcribe(blob, mimeType);
        } catch {
          // error already set by transcribe
        } finally {
          setIsRecording(false);
        }
      };

      recorder.start();
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
  }, [transcribe, clearError]);

  const stopRecordingWeb = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      // Recorder already stopped or never started — clean up anyway
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsRecording(false);
      return;
    }
    recorder.stop();
  }, []);

  const cancelRecordingWeb = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;

    // Stop the recorder without triggering onstop's transcribe
    if (recorder && recorder.state !== 'inactive') {
      // Remove the onstop handler so transcribe is not called
      recorder.onstop = () => {};
      recorder.stop();
    }

    // Stop all tracks
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    chunksRef.current = [];
    mediaRecorderRef.current = null;
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
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = () => {}; // prevent transcribe
          recorder.stop();
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        chunksRef.current = [];
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

/** Map a MIME type to a common file extension for the upload. */
function mimeTypeToExt(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('ogg') || mime.includes('opus')) return 'ogg';
  if (mime.includes('mp3') || mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav') || mime.includes('wave')) return 'wav';
  if (mime.includes('flac')) return 'flac';
  return 'wav';
}
