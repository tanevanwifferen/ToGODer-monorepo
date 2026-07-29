import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
  Dimensions,
  useColorScheme,
  ActivityIndicator,
  StatusBar,
  Text,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Colors } from '../../constants/Colors';
import { fetchAndDecryptImage } from '../../utils/imageCrypto';
import { getApiUrl } from '../../constants/Env';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_IMAGE_WIDTH = SCREEN_WIDTH * 0.75;

function getCacheDir(): string {
  return `${FileSystem.cacheDirectory ?? ''}togoder-images/`;
}

async function ensureCacheDir(): Promise<void> {
  const dir = getCacheDir();
  if (!dir || dir === 'togoder-images/') return; // no cache directory available
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // best-effort — fall back to data URI if cache is unavailable
  }
}

/**
 * Regex patterns for detecting images in message text.
 */
const MARKDOWN_IMAGE_RE = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
const BASE64_IMAGE_RE = /(data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+)/gi;
/** Token parameter values are base64 + encodeURIComponent, nothing else.
 *  A looser class (e.g. [^\s&]+) greedily eats the closing `)` of the
 *  markdown wrapper and any following JSON delimiters. */
const REF_VALUE = String.raw`[A-Za-z0-9%+/=._~-]+`;
const TOGODER_REF_SRC =
  String.raw`togoder-image:\/\/[a-f0-9]{32}\?key=${REF_VALUE}&iv=${REF_VALUE}(?:&scheme=${REF_VALUE})?`;

const TOGODER_IMAGE_RE = new RegExp(
  String.raw`!\[.*?\]\((${TOGODER_REF_SRC})\)`,
  'gi',
);
/** Bare togoder-image:// reference URL (without markdown wrapper).
 *  Detected as a fallback when the LLM outputs the reference URL directly. */
const BARE_TOGODER_IMAGE_RE = new RegExp(`(${TOGODER_REF_SRC})`, 'gi');
const PLAIN_IMAGE_URL_RE =
  /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?)/gi;

interface ParsedSegment {
  type: 'text' | 'image';
  value: string;
}

/**
 * Split message text into text and image segments, detecting:
 * - Markdown image syntax: ![alt](url)
 * - togoder-image:// reference tokens (stored encrypted on disk)
 * - Base64 data URIs: data:image/...
 * - Plain image URLs ending in .png, .jpg, .jpeg, .gif, .webp
 */
export function parseImageSegments(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let remaining = text;

  // Combined regex: markdown image | togoder-image ref | bare togoder-image | base64 data URI | plain image URL
  const combinedRe = new RegExp(
    `(${MARKDOWN_IMAGE_RE.source})|(${TOGODER_IMAGE_RE.source})|(${BARE_TOGODER_IMAGE_RE.source})|(${BASE64_IMAGE_RE.source})|(${PLAIN_IMAGE_URL_RE.source})`,
    'gi'
  );

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = combinedRe.exec(remaining)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      const before = remaining.slice(lastIndex, match.index);
      if (before.trim().length > 0) {
        segments.push({ type: 'text', value: before });
      }
    }

    // Extract the actual image source
    let imageSrc = match[0];
    // If markdown image: ![alt](url) — extract just the URL
    if (match[0].startsWith('![')) {
      const urlMatch = match[0].match(/\(([^\s)]+)\)/);
      if (urlMatch) {
        imageSrc = urlMatch[1];
      }
    }

    segments.push({ type: 'image', value: imageSrc });
    lastIndex = combinedRe.lastIndex;
  }

  // Remaining text after last match
  if (lastIndex < remaining.length) {
    const after = remaining.slice(lastIndex);
    if (after.trim().length > 0) {
      segments.push({ type: 'text', value: after });
    }
  }

  // If no images found, return single text segment
  if (segments.length === 0) {
    return [{ type: 'text', value: text }];
  }

  return segments;
}

/**
 * Check if a message text contains any detectable images.
 */
export function hasImages(text: string): boolean {
  if (!text) return false;
  // All the patterns above carry the /g flag, which makes `.test()` stateful
  // through lastIndex: calling it twice on the same string alternates
  // true/false. Since this is called repeatedly on every render (and by two
  // separate renderers), the global flag must be dropped for the check.
  return [
    MARKDOWN_IMAGE_RE,
    TOGODER_IMAGE_RE,
    BARE_TOGODER_IMAGE_RE,
    BASE64_IMAGE_RE,
    PLAIN_IMAGE_URL_RE,
  ].some((re) => new RegExp(re.source, 'i').test(text));
}

/**
 * Write base64 image data to the cache directory and return a file:// URI.
 * Uses expo-file-system for reliable cross-platform file I/O.
 */
async function cacheDecryptedImage(
  ref: string,
  base64Data: string,
): Promise<string | null> {
  try {
    await ensureCacheDir();

    // Use the ref's hash as a stable cache key (prefix of the id)
    const parsed = ref.match(/togoder-image:\/\/([a-f0-9]{32})/i);
    const id = parsed ? parsed[1] : ref.slice(-32);
    const uri = `${getCacheDir()}${id}.png`;

    // Check cache first — immutable images never change
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      console.log('[InlineImage] cache hit', { id, uri });
      return uri;
    }

    await FileSystem.writeAsStringAsync(uri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('[InlineImage] cached image', { id, uri, size: base64Data.length });
    return uri;
  } catch (e: any) {
    console.warn('[InlineImage] cache write error', e?.message ?? e);
    return null;
  }
}

/**
 * Render an inline image with proper sizing, theming, and tap-to-expand.
 *
 * When the source is a togoder-image:// reference token, the component
 * fetches the encrypted ciphertext from the server, decrypts it, writes
 * the result to the device cache, and renders from a file:// URI.  This
 * is far more reliable than inline data: URIs which silently fail on
 * some React Native platforms when the payload is large.
 *
 * Tap the image to open a fullscreen lightbox view. The lightbox adapts
 * to the device color scheme (dark/light background).
 */
export function InlineImage({ source }: { source: string }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const borderColor = Colors[colorScheme ?? 'light'].tint + '44'; // tint at ~27% opacity

  // If it's a togoder-image:// reference, we need to fetch + decrypt + cache
  const isRef = source.startsWith('togoder-image://');
  const [imageUri, setImageUri] = useState<string | null>(
    isRef ? null : source
  );
  const [loadError, setLoadError] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // Tap-to-expand lightbox
  const [expanded, setExpanded] = useState(false);
  const openLightbox = useCallback(() => {
    if (imageUri && !imageLoadError) setExpanded(true);
  }, [imageUri, imageLoadError]);
  const closeLightbox = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!isRef) return;
    let cancelled = false;

    (async () => {
      try {
        const apiBase = getApiUrl();
        console.log('[InlineImage] fetchAndDecryptImage start', {
          ref: source.slice(0, 60),
        });
        const b64 = await fetchAndDecryptImage(source, apiBase);
        if (cancelled) return;

        if (!b64) {
          console.warn('[InlineImage] fetchAndDecryptImage returned null');
          setLoadError(true);
          return;
        }

        // Write decrypted image to cache and use file:// URI
        const fileUri = await cacheDecryptedImage(source, b64);
        if (cancelled) return;

        if (fileUri) {
          console.log('[InlineImage] rendering from file URI', {
            uri: fileUri.slice(-50),
          });
          setImageUri(fileUri);
        } else {
          // Fallback: use data URI if caching fails
          console.warn('[InlineImage] cache failed, falling back to data URI');
          setImageUri(`data:image/png;base64,${b64}`);
        }
      } catch (e: any) {
        console.warn('[InlineImage] unexpected error', e?.message ?? e);
        if (!cancelled) setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, isRef]);

  // Error state — show a subtle fallback instead of nothing
  if (loadError) {
    return null;
  }

  // Loading state — show a spinner placeholder
  if (imageUri === null) {
    return (
      <View style={[styles.imageContainer, styles.loadingContainer, { borderColor }]}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />
      </View>
    );
  }

  // Image failed to load (e.g. corrupt data) — show discreet error indicator
  if (imageLoadError) {
    return (
      <View style={[styles.imageContainer, styles.errorContainer, { borderColor }]}>
        <Text style={styles.errorText}>⚠️ Image failed to load</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable onPress={openLightbox}>
        <View style={[styles.imageContainer, { borderColor }]}>
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="Generated image"
            accessibilityHint="Tap to view full size"
            onError={(e) => {
              console.warn('[InlineImage] Image onError', {
                uri: imageUri.slice(0, 60),
                error: e?.nativeEvent?.error ?? 'unknown',
              });
              setImageLoadError(true);
            }}
            onLoad={() => {
              console.log('[InlineImage] Image onLoad success');
            }}
          />
        </View>
      </Pressable>

      {/* Lightbox modal — fullscreen image view */}
      <Modal
        visible={expanded}
        transparent={false}
        animationType="fade"
        onRequestClose={closeLightbox}
        statusBarTranslucent
      >
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <Pressable
          style={[
            styles.lightboxOverlay,
            { backgroundColor: isDark ? '#000' : '#fff' },
          ]}
          onPress={closeLightbox}
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.lightboxImage}
            resizeMode="contain"
            accessibilityLabel="Generated image fullscreen"
            accessibilityHint="Tap anywhere to close"
          />
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  loadingContainer: {
    width: MAX_IMAGE_WIDTH,
    height: MAX_IMAGE_WIDTH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    width: MAX_IMAGE_WIDTH,
    height: MAX_IMAGE_WIDTH / 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 13,
    opacity: 0.6,
  },
  image: {
    width: MAX_IMAGE_WIDTH,
    height: MAX_IMAGE_WIDTH, // Square aspect by default, adjusts via resizeMode
    maxWidth: MAX_IMAGE_WIDTH,
  },
  lightboxOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_WIDTH * 0.95,
    height: SCREEN_WIDTH * 0.95,
  },
});
