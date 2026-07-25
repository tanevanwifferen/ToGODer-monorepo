import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useSelector } from 'react-redux';
import { selectTtsEnabled } from '../redux/slices/userSettingsSlice';

const API_BASE = ''; // Same origin

/**
 * Hook for Text-to-Speech playback of completed assistant messages.
 *
 * Strategy:
 * - Web: Uses the browser's built-in SpeechSynthesis API (zero latency,
 *   no server round-trip). Falls back to server /api/tts if unavailable.
 * - Mobile (React Native): Uses server /api/tts endpoint with expo-av
 *   for audio playback.
 */
export function useTts() {
  const ttsEnabled = useSelector(selectTtsEnabled);
  const soundRef = useRef<any>(null);

  const speakServer = useCallback(async (text: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
      const blob = await res.blob();

      if (Platform.OS === 'web') {
        // Web: use HTMLAudioElement
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        soundRef.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      } else {
        // Mobile: use expo-av
        try {
          const { Audio } = require('expo-av');
          // Convert blob to base64 data URI
          const reader = new FileReader();
          const dataUri = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const { sound } = await Audio.Sound.createAsync(
            { uri: dataUri },
            { shouldPlay: true },
          );
          soundRef.current = sound;
        } catch (e) {
          console.warn('[tts] expo-av unavailable, cannot play audio:', e);
        }
      }
    } catch (err) {
      console.warn('[tts] Server TTS failed:', err);
    }
  }, []);

  const speakWeb = useCallback((text: string) => {
    // Browser SpeechSynthesis — instant, no server needed
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
        return;
      } catch {
        // Fall through to server endpoint
      }
    }

    // Fallback: server-side TTS (mobile, or speechsynthesis unavailable)
    speakServer(text);
  }, [speakServer]);

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || !text || text.trim().length === 0) return;
      speakWeb(text);
    },
    [ttsEnabled, speakWeb],
  );

  const stop = useCallback(async () => {
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      window.speechSynthesis.cancel();
    }
    if (soundRef.current) {
      try {
        if (Platform.OS === 'web') {
          (soundRef.current as HTMLAudioElement).pause();
        } else {
          await soundRef.current.unloadAsync?.();
        }
      } catch {}
      soundRef.current = null;
    }
  }, []);

  return { speak, stop, enabled: ttsEnabled };
}
