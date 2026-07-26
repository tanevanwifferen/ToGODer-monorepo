import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useSelector } from 'react-redux';
import { selectTtsEnabled } from '../redux/slices/userSettingsSlice';

const API_BASE = ''; // Same origin

/**
 * Hook for Text-to-Speech playback of completed assistant messages.
 *
 * Strategy:
 * - Web: Browser SpeechSynthesis API (instant, no server round-trip).
 *        Falls back to server /api/tts (espeak-ng + ffmpeg → MP3) if
 *        SpeechSynthesis is unavailable.
 * - Mobile: POST /api/tts → MP3 blob → expo-av Sound playback.
 *
 * Autoplay handling: browsers may block audio.play() without a prior
 * user gesture. The call to speak() always comes from a user action
 * (sending a message), so playback is allowed. If blocked, a warning
 * is logged.
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
        // Web: HTMLAudioElement from blob URL
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        soundRef.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        audio.onerror = () => URL.revokeObjectURL(url);
        try {
          await audio.play();
        } catch (playErr: any) {
          // Autoplay blocked — not a critical error, log and continue
          console.warn('[tts] Audio play blocked by browser autoplay policy:', playErr.message);
        }
      } else {
        // Mobile: expo-av Sound from blob data URI
        try {
          const { Audio } = require('expo-av');
          const reader = new FileReader();
          const dataUri = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const { sound } = await Audio.Sound.createAsync(
            { uri: dataUri },
            { shouldPlay: true, volume: 1.0 },
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
        // Prefer a natural-sounding English voice if available
        const voices = window.speechSynthesis.getVoices();
        const enVoice = voices.find(
          (v) => v.lang.startsWith('en') && v.localService,
        );
        if (enVoice) utterance.voice = enVoice;
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
