import { promises as dnsPromises, type LookupAddress } from 'node:dns';
import * as net from 'node:net';

/**
 * Result of an SSRF URL check.
 * - ok: whether the URL is safe to fetch
 * - reason: human-readable explanation when ok is false
 * - resolvedIp: a public IP the hostname resolved to (present when ok)
 */
export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
  resolvedIp?: string;
}

/**
 * Options for checkUrl.
 * - bypassPrivateBlock: when true (the tanevanwifferen@gmail.com case) all
 *   private/loopback blocking is skipped and the URL is allowed immediately,
 *   without resolving or inspecting any address.
 */
export interface SsrfCheckOptions {
  bypassPrivateBlock: boolean;
}

// IPv4 blocked ranges expressed as [network, mask] in big-endian uint32 form.
// Each entry: [networkAddress, maskBits].
const IPV4_BLOCKED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [ipToInt('0.0.0.0'), 8], // 0.0.0.0/8 ("this host")
  [ipToInt('10.0.0.0'), 8], // 10.0.0.0/8 (private A)
  [ipToInt('100.64.0.0'), 10], // 100.64.0.0/10 (CGNAT)
  [ipToInt('127.0.0.0'), 8], // 127.0.0.0/8 (loopback)
  [ipToInt('169.254.0.0'), 16], // 169.254.0.0/16 (link-local / cloud metadata)
  [ipToInt('172.16.0.0'), 12], // 172.16.0.0/12 (private B)
  [ipToInt('192.168.0.0'), 16], // 192.168.0.0/16 (private C)
];

function ipToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    throw new Error(`Invalid IPv4 octet string: ${ip}`);
  }
  const octets = parts.map((p) => Number(p));
  // Use >>>0 to keep the result unsigned.
  return (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }
  return (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0);
}

function isIpv4InBlockedRange(ip: string): boolean {
  const int = ipv4ToInt(ip);
  if (int === null) return false;
  for (const [network, maskBits] of IPV4_BLOCKED_RANGES) {
    const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
    if ((int & mask) >>> 0 === (network & mask) >>> 0) {
      return true;
    }
  }
  return false;
}

/**
 * If `addr` is an IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible (::a.b.c.d)
 * IPv6 address, return the embedded IPv4 string (dotted-quad). The WHATWG
 * URL parser normalizes these to hex form (::ffff:XXXX:YYYY / ::XXXX:YYYY),
 * so we decode both the dotted-quad and hex representations. Returns null if
 * the address is not an IPv4-mapped/compatible form.
 */
function extractMappedIpv4(addr: string): string | null {
  const lower = addr.toLowerCase();
  // Check the mapped prefix (::ffff:) first, then the compatible prefix (::).
  for (const prefix of ['::ffff:', '::']) {
    if (!lower.startsWith(prefix)) continue;
    const s = lower.slice(prefix.length);
    if (s.length === 0) continue;

    // Dotted-quad form: a.b.c.d
    const dotted = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (dotted && dotted[1] && dotted[2] && dotted[3] && dotted[4]) {
      const octets = [dotted[1], dotted[2], dotted[3], dotted[4]].map(Number);
      if (octets.every((o) => o >= 0 && o <= 255)) {
        return `${octets[0]}.${octets[1]}.${octets[2]}.${octets[3]}`;
      }
      return null;
    }

    // Hex form: XXXX:YYYY (two 16-bit groups) -> decode to a.b.c.d
    const hexPair = s.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexPair && hexPair[1] && hexPair[2]) {
      const hi = parseInt(hexPair[1], 16);
      const lo = parseInt(hexPair[2], 16);
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
  }
  return null;
}

/**
 * Returns the embedded IPv4 if the given IPv6 address is an IPv4-mapped or
 * IPv4-compatible address that resolves to a blocked IPv4 range, else null.
 */
function ipv6MapsToBlockedIpv4(addr: string): string | null {
  const v4 = extractMappedIpv4(addr);
  if (v4 !== null && isIpv4InBlockedRange(v4)) return v4;
  return null;
}

function isIpv6Blocked(addr: string): boolean {
  const lower = addr.toLowerCase();
  // ::1 loopback
  if (lower === '::1') return true;
  // IPv4-mapped / IPv4-compatible forms that resolve to a blocked v4 range.
  if (ipv6MapsToBlockedIpv4(lower) !== null) return true;
  // Inspect the first 16-bit group for ULA (fc00::/7) and link-local (fe80::/10).
  const firstColon = lower.indexOf(':');
  const firstGroupHex = firstColon === -1 ? lower : lower.slice(0, firstColon);
  const firstGroup = parseInt(firstGroupHex, 16);
  if (Number.isNaN(firstGroup)) return false;
  // ULA fc00::/7  -> (firstGroup & 0xfe00) === 0xfc00
  if ((firstGroup & 0xfe00) === 0xfc00) return true;
  // link-local fe80::/10 -> (firstGroup & 0xffc0) === 0xfe80
  if ((firstGroup & 0xffc0) === 0xfe80) return true;
  return false;
}

function isBlockedIp(addr: string): boolean {
  if (net.isIPv4(addr)) {
    return isIpv4InBlockedRange(addr);
  }
  if (net.isIPv6(addr)) {
    return isIpv6Blocked(addr);
  }
  // Not a recognizable IP literal — treat as blocked (fail closed).
  return true;
}

/**
 * Validate that an HTTP(S) URL does not target a private, loopback,
 * link-local, or cloud-metadata address. Used both at MCP server config
 * save time and before every tool-call invocation.
 *
 * When `opts.bypassPrivateBlock === true` (the tanevanwifferen@gmail.com
 * case), the URL is allowed immediately without any DNS resolution or
 * address inspection.
 */
export async function checkUrl(
  url: string,
  opts: SsrfCheckOptions,
): Promise<SsrfCheckResult> {
  // 1. Reject non-string / empty URLs and require http(s) scheme.
  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, reason: 'url must be a non-empty string' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'scheme must be http or https' };
  }

  // 2. Bypass: skip all private/loopback blocking (tanevanwifferen@gmail.com).
  if (opts.bypassPrivateBlock) {
    return { ok: true };
  }

  const hostname = parsed.hostname;

  // 6. Handle raw IP literals (including IPv6 brackets, which the WHATWG
  // URL spec leaves in `hostname` as e.g. "[fe80::1]") without DNS lookup.
  const bareHost =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  if (net.isIPv4(bareHost)) {
    if (isBlockedIp(bareHost)) {
      return { ok: false, reason: `blocked private/loopback/link-local IP ${bareHost}` };
    }
    return { ok: true, resolvedIp: bareHost };
  }
  if (net.isIPv6(bareHost)) {
    if (isBlockedIp(bareHost)) {
      return { ok: false, reason: `blocked private/loopback/link-local IP ${bareHost}` };
    }
    return { ok: true, resolvedIp: bareHost };
  }

  // 3. Resolve hostname to A + AAAA records.
  let records: LookupAddress[];
  try {
    records = await dnsPromises.lookup(bareHost, { all: true });
  } catch {
    return { ok: false, reason: 'hostname does not resolve' };
  }
  if (!records || records.length === 0) {
    return { ok: false, reason: 'hostname does not resolve' };
  }

  // 4 + 5. If at least one resolved IP is public, allow; if all are blocked,
  // reject with the first blocked IP in the reason.
  let firstBlocked: string | undefined;
  for (const rec of records) {
    const addr = rec.address;
    if (!isBlockedIp(addr)) {
      return { ok: true, resolvedIp: addr };
    }
    if (firstBlocked === undefined) firstBlocked = addr;
  }
  return {
    ok: false,
    reason: `blocked private/loopback/link-local IP ${firstBlocked ?? records[0]?.address ?? bareHost}`,
  };
}

// ---------------------------------------------------------------------------
// Sanity self-check — run with: node bin/Services/McpSsrfGuard.js
// ---------------------------------------------------------------------------
if (require.main === module) {
  const eq = (a: unknown, b: unknown) => a === b;
  const run = async () => {
    const cases: Array<{ name: string; url: string; bypass: boolean; expectOk: boolean }> = [
      { name: 'localhost http', url: 'http://127.0.0.1', bypass: false, expectOk: false },
      { name: '169.254.169.254 metadata', url: 'http://169.254.169.254', bypass: false, expectOk: false },
      { name: 'private 10.x', url: 'http://10.0.0.1', bypass: false, expectOk: false },
      { name: 'private 192.168.x', url: 'http://192.168.1.1', bypass: false, expectOk: false },
      { name: 'private 172.16.x', url: 'http://172.16.0.1', bypass: false, expectOk: false },
      { name: 'cgnat 100.64.x', url: 'http://100.64.0.1', bypass: false, expectOk: false },
      { name: 'ipv6 loopback', url: 'http://[::1]', bypass: false, expectOk: false },
      { name: 'ipv6 mapped v4 loopback ::ffff:127.0.0.1', url: 'http://[::ffff:127.0.0.1]', bypass: false, expectOk: false },
      { name: 'ipv6 ula fc00::', url: 'http://[fc00::1]', bypass: false, expectOk: false },
      { name: 'ipv6 ula fd00::', url: 'http://[fd00::1]', bypass: false, expectOk: false },
      { name: 'ipv6 link-local fe80::', url: 'http://[fe80::1]', bypass: false, expectOk: false },
      { name: 'ipv6 fec0:: outside fe80::/10 (allowed)', url: 'http://[fec0::1]', bypass: false, expectOk: true },
      { name: 'ipv6 public 2606:4700::1', url: 'http://[2606:4700::1]', bypass: false, expectOk: true },
      { name: '8.8.8.8 public', url: 'http://8.8.8.8', bypass: false, expectOk: true },
      { name: 'example.com resolves public', url: 'http://example.com', bypass: false, expectOk: true },
      { name: 'bypass on 127.0.0.1', url: 'http://127.0.0.1', bypass: true, expectOk: true },
      { name: 'bypass on metadata', url: 'http://169.254.169.254', bypass: true, expectOk: true },
      { name: 'ftp scheme rejected', url: 'ftp://8.8.8.8', bypass: false, expectOk: false },
      { name: 'empty url', url: '', bypass: false, expectOk: false },
    ];
    let pass = 0;
    let fail = 0;
    for (const c of cases) {
      const res = await checkUrl(c.url, { bypassPrivateBlock: c.bypass });
      const ok = eq(res.ok, c.expectOk);
      if (ok) {
        pass++;
      } else {
        fail++;
        console.log(`FAIL  ${c.name}: expected ok=${c.expectOk}, got ${JSON.stringify(res)}`);
      }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail > 0) process.exitCode = 1;
  };
  run().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
