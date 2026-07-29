/**
 * Tests for client-side image reference parsing.
 *
 * These lock in the two defects that stopped real images from rendering:
 *  - the ref regex was greedy enough to swallow surrounding delimiters,
 *    producing refs that failed to parse and 400ed at the blob endpoint;
 *  - `hasImages()` used /g regexes with .test(), so repeated calls
 *    alternated true/false and images intermittently vanished.
 */

import { parseImageRef, extractAllImageRefs } from '../imageCrypto';
import { parseImageSegments, hasImages } from '../../components/chat/InlineImage';

const ID = 'b9f3a01695ba596219fd6634fa20ca9e';
// Realistic RSA-wrapped key: base64 with +, / and = that must survive parsing.
const KEY = 'yk3%2B2HCYA9YQXSKI6PZyBnb%2FcViqnqPCeSQZKXIfVoR%2Blhs%3D';
const IV = 'OSI0lXPBs0ushg0k';
const REF = `togoder-image://${ID}?key=${KEY}&iv=${IV}&scheme=rsa`;

describe('parseImageRef', () => {
  it('parses an asymmetric ref and URL-decodes the key', () => {
    const p = parseImageRef(REF);
    expect(p).not.toBeNull();
    expect(p!.id).toBe(ID);
    expect(p!.scheme).toBe('rsa');
    expect(p!.iv).toBe(IV);
    // The +, / and = must come back intact or AES key import fails.
    expect(p!.key).toBe('yk3+2HCYA9YQXSKI6PZyBnb/cViqnqPCeSQZKXIfVoR+lhs=');
  });

  it('parses a symmetric ref with no scheme', () => {
    const p = parseImageRef(`togoder-image://${ID}?key=abc%2B%2F%3D&iv=${IV}`);
    expect(p).not.toBeNull();
    expect(p!.scheme).toBeNull();
  });

  it('rejects malformed refs', () => {
    expect(parseImageRef('https://example.com/x.png')).toBeNull();
    expect(parseImageRef(`togoder-image://xyz?key=a&iv=b`)).toBeNull();
  });
});

describe('extractAllImageRefs', () => {
  it('does not swallow the closing markdown paren', () => {
    const refs = extractAllImageRefs(`Here: ![Generated image 1](${REF})`);
    expect(refs).toEqual([REF]);
  });

  it('does not swallow JSON delimiters', () => {
    const json = JSON.stringify({ imageRef: REF, markdown: `![i](${REF})` });
    // Same ref twice in the payload, deduped to one.
    expect(extractAllImageRefs(json)).toEqual([REF]);
  });

  it('finds multiple distinct refs', () => {
    const other = REF.replace(ID, 'a'.repeat(32));
    expect(extractAllImageRefs(`![a](${REF}) ![b](${other})`)).toHaveLength(2);
  });
});

describe('hasImages', () => {
  it('is stable across repeated calls (regression: /g + .test())', () => {
    const text = `![Generated image 1](${REF})`;
    for (let i = 0; i < 5; i++) expect(hasImages(text)).toBe(true);
    for (let i = 0; i < 5; i++) expect(hasImages('just words')).toBe(false);
  });

  it('detects plain urls and data uris too', () => {
    expect(hasImages('see https://x.com/a.png')).toBe(true);
    expect(hasImages('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });
});

describe('parseImageSegments', () => {
  it('splits text around a togoder ref and yields the bare ref as src', () => {
    const segs = parseImageSegments(`Before ![Generated image 1](${REF}) after`);
    expect(segs.map((s) => s.type)).toEqual(['text', 'image', 'text']);
    // The image segment must be the exact ref, with no trailing ')'.
    expect(segs[1].value).toBe(REF);
    expect(segs[0].value).toContain('Before');
    expect(segs[2].value).toContain('after');
  });

  it('returns a single text segment when there is no image', () => {
    const segs = parseImageSegments('nothing to see');
    expect(segs).toEqual([{ type: 'text', value: 'nothing to see' }]);
  });

  it('handles a ref emitted bare, without markdown', () => {
    const segs = parseImageSegments(`look: ${REF}`);
    const img = segs.find((s) => s.type === 'image');
    expect(img?.value).toBe(REF);
  });
});
