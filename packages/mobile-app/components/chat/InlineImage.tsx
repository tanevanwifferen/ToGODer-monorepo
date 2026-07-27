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
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { fetchAndDecryptImage } from '../../utils/imageCrypto';
import { getApiUrl } from '../../constants/Env';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_IMAGE_WIDTH = SCREEN_WIDTH * 0.75;

/**
 * Regex patterns for detecting images in message text.
 */
const MARKDOWN_IMAGE_RE = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
const BASE64_IMAGE_RE = /(data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+)/gi;
const TOGODER_IMAGE_RE =
  /!\[.*?\]\((togoder-image:\/\/[a-f0-9]{32}\?key=[^&]+&iv=[^\s)]+(?:&scheme=[^\s)]+)?)\)/gi;
/** Bare togoder-image:// reference URL (without markdown wrapper).
 *  Detected as a fallback when the LLM outputs the reference URL directly. */
const BARE_TOGODER_IMAGE_RE =
  /(togoder-image:\/\/[a-f0-9]{32}\?key=[^\s&]+&iv=[^\s&]+(?:&scheme=[^\s&]+)?)/gi;
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
  return (
    MARKDOWN_IMAGE_RE.test(text) ||
    TOGODER_IMAGE_RE.test(text) ||
    BARE_TOGODER_IMAGE_RE.test(text) ||
    BASE64_IMAGE_RE.test(text) ||
    PLAIN_IMAGE_URL_RE.test(text)
  );
}

/**
 * Render an inline image with proper sizing, theming, and tap-to-expand.
 *
 * When the source is a togoder-image:// reference token, the component
 * fetches the encrypted ciphertext from the server, decrypts it with the
 * key/nonce embedded in the token, and renders the resulting data URI.
 * Non-reference URLs (https://, data:) are rendered directly.
 *
 * Tap the image to open a fullscreen lightbox view. The lightbox adapts
 * to the device color scheme (dark/light background).
 */
export function InlineImage({ source }: { source: string }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const borderColor = Colors[colorScheme ?? 'light'].tint + '44'; // tint at ~27% opacity

  // If it's a togoder-image:// reference, we need to fetch + decrypt
  const isRef = source.startsWith('togoder-image://');
  const [decryptedUri, setDecryptedUri] = useState<string | null>(
    isRef ? null : source
  );
  const [decryptError, setDecryptError] = useState(false);

  // Tap-to-expand lightbox
  const [expanded, setExpanded] = useState(false);
  const openLightbox = useCallback(() => {
    if (decryptedUri) setExpanded(true);
  }, [decryptedUri]);
  const closeLightbox = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!isRef) return;
    let cancelled = false;

    (async () => {
      try {
        const apiBase = getApiUrl();
        const uri = await fetchAndDecryptImage(source, apiBase);
        if (!cancelled) {
          if (uri) {
            setDecryptedUri(uri);
          } else {
            setDecryptError(true);
          }
        }
      } catch {
        if (!cancelled) setDecryptError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, isRef]);

  // Error state — show nothing (avoid a broken-image icon)
  if (decryptError) {
    return null;
  }

  // Loading state — show a spinner placeholder
  if (decryptedUri === null) {
    return (
      <View style={[styles.imageContainer, styles.loadingContainer, { borderColor }]}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />
      </View>
    );
  }

  return (
    <>
      <Pressable onPress={openLightbox}>
        <View style={[styles.imageContainer, { borderColor }]}>
          <Image
            source={{ uri: decryptedUri }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="Generated image"
            accessibilityHint="Tap to view full size"
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
            source={{ uri: decryptedUri }}
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
