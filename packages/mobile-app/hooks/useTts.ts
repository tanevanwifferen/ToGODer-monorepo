import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import { selectTtsEnabled } from '../redux/slices/userSettingsSlice';

const API_BASE = ''; // Same origin

// ── Shared AudioContext singleton (web only) ──────────────────────────
// A single context avoids autoplay issues: each new Audio/webkitAudioContext
// starts in "suspended" state, and only one can be active at a time.
// We create it lazily on the first server-TTS call and resume it on the
// first user interaction so playback is never silently blocked.
let _sharedCtx: AudioContext | null = null;
let _ctxResumed = false;

function _getSharedAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const AnyAudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AnyAudioContext) return null;

  if (!_sharedCtx) {
    _sharedCtx = new AnyAudioContext();
  }
  const ctx = _sharedCtx!;

  // Wire a one-shot user-interaction listener to resume the context.
  // Touch / click / keydown are all treated as qualifying gestures by
  // modern browsers.
  if (!_ctxResumed && ctx.state === 'suspended') {
    _ctxResumed = true; // only wire once
    const resume = () => {
      ctx.resume().catch(() => {});
    };
    for (const evt of ['click', 'touchstart', 'keydown', 'mousedown'] as const) {
      document.addEventListener(evt, resume, { once: true });
    }
  }

  return ctx;
}

// Track the currently-playing source so we can stop it on demand.
let _activeSource: AudioBufferSourceNode | null = null;

/**
 * Hook for Text-to-Speech playback of completed assistant messages.
 *
 * Strategy:
 * - Web:  Primary = server Piper-TTS (POST /api/tts → MP3) played through
 *          a single shared AudioContext.  Falls back to browser
 *          SpeechSynthesis if server TTS fails or AudioContext is
 *          unavailable.
 * - Mobile: POST /api/tts → MP3 blob → expo-av Sound playback.
 *
 * Autoplay handling:
 * A single shared AudioContext is created lazily.  It is resumed on the
 * first qualifying user interaction (click / touch / key) so that
 * playback is never silently blocked, even though onComplete fires well
 * after the initial "send" gesture.
 */
export function useTts() {
  const ttsEnabled = useSelector(selectTtsEnabled);
  const soundRef = useRef<any>(null);

  // ── Stop any in-flight TTS on unmount ─────────────────────────────
  useEffect(() => {
    return () => {
      _activeSource?.stop();
      _activeSource = null;
      soundRef.current?.unloadAsync?.();
      soundRef.current = null;
    };
  }, []);

  // ── Server TTS → AudioContext (web) or expo-av (mobile) ──────────
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
        // ── Web: shared AudioContext ──────────────────────────────
        const ctx = _getSharedAudioContext();
        if (!ctx) throw new Error('No AudioContext available');

        // Ensure the context is running.  If still suspended after
        // resume() the user hasn't interacted yet — fall back to
        // SpeechSynthesis.
        if (ctx.state === 'suspended') {
          await ctx.resume();
          if (ctx.state === 'suspended') {
            throw new Error('AudioContext locked — no user gesture yet');
          }
        }

        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        // Stop any previously-playing source
        _activeSource?.stop();
        _activeSource = null;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          if (_activeSource === source) _activeSource = null;
        };
        _activeSource = source;
        source.start();
      } else {
        // ── Mobile: expo-av ──────────────────────────────────────
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
      throw err; // re-throw so speakWeb can fall back to SpeechSynthesis
    }
  }, []);

  // ── Primary entry point ───────────────────────────────────────────
  const speak = useCallback(
    async (text: string) => {
      if (!text || text.trim().length === 0) return;

      if (!ttsEnabled) {
        Toast.show({
          type: 'info',
          text1: 'Text-to-speech is disabled',
          text2: 'Enable it in Settings to hear messages read aloud.',
          position: 'bottom',
          visibilityTime: 4000,
        });
        return;
      }

      if (Platform.OS === 'web') {
        // Web: try server TTS first (Piper, high quality), fall back
        // to SpeechSynthesis on failure.
        try {
          await speakServer(text);
          return;
        } catch {
          // Fall through to SpeechSynthesis
        }

        if (
          typeof window !== 'undefined' &&
          'speechSynthesis' in window
        ) {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            const voices = window.speechSynthesis.getVoices();
            const enVoice = voices.find(
              (v) => v.lang.startsWith('en') && v.localService,
            );
            if (enVoice) utterance.voice = enVoice;
            window.speechSynthesis.speak(utterance);
          } catch {
            console.warn('[tts] SpeechSynthesis also unavailable');
          }
        }
      } else {
        // Mobile: server TTS only
        await speakServer(text).catch(() => {});
      }
    },
    [ttsEnabled, speakServer],
  );

  const stop = useCallback(async () => {
    // Web: stop AudioContext source
    _activeSource?.stop();
    _activeSource = null;

    // Web: cancel SpeechSynthesis (in case it's playing)
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      window.speechSynthesis.cancel();
    }

    // Mobile: stop expo-av sound
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync?.();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  return { speak, stop, enabled: ttsEnabled };
}
