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
 * Returns true if the address is an IPv6 address that, when it is an
 * IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible (::a.b.c.d) address,
 * maps to a blocked IPv4 range. Otherwise returns false.
 */
function ipv6MapsToBlockedIpv4(addr: string): string | null {
  // IPv4-mapped: ::ffff:a.b.c.d  /  ::ffff:hex
  // IPv4-compatible (deprecated but block anyway): ::a.b.c.d
  const mapped = addr.match(/^(?:::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped && mapped[1]) {
    const v4 = mapped[1];
    if (isIpv4InBlockedRange(v4)) return v4;
  }
  return null;
}

function isIpv6Blocked(addr: string): boolean {
  const lower = addr.toLowerCase();
  // ::1 loopback
  if (lower === '::1') return true;
  // IPv4-mapped / IPv4-compatible forms that resolve to a blocked v4 range.
  if (ipv6MapsToBlockedIpv4(lower) !== null) return true;
  // ULA fc00::/7  -> first byte & 0xfe === 0xfc
  // link-local fe80::/10 -> first two bytes: 0xfe, (second & 0xc0) === 0x80
  const firstColon = lower.indexOf(':');
  const firstGroupHex = firstColon === -1 ? lower : lower.slice(0, firstColon);
  const firstByte = firstGroupHex.length >= 2 ? parseInt(firstGroupHex.slice(0, 2), 16) : NaN;
  if (Number.isNaN(firstByte)) return false;
  if ((firstByte & 0xfe) === 0xfc) return true; // fc00::/7
  if (firstByte === 0xfe) {
    // fe80::/10: second 16-bit group's top 6 bits set. For fe80:: the
    // remainder is zero, which satisfies /10.
    return true;
  }
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

  // 6. Handle raw IP literals (including IPv6 brackets, already stripped by
  // URL.hostname) without DNS lookup.
  if (net.isIPv4(hostname)) {
    if (isBlockedIp(hostname)) {
      return { ok: false, reason: `blocked private/loopback/link-local IP ${hostname}` };
    }
    return { ok: true, resolvedIp: hostname };
  }
  if (net.isIPv6(hostname)) {
    if (isBlockedIp(hostname)) {
      return { ok: false, reason: `blocked private/loopback/link-local IP ${hostname}` };
    }
    return { ok: true, resolvedIp: hostname };
  }

  // 3. Resolve hostname to A + AAAA records.
  let records: LookupAddress[];
  try {
    records = await dnsPromises.lookup(hostname, { all: true });
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
    reason: `blocked private/loopback/link-local IP ${firstBlocked ?? records[0]?.address ?? hostname}`,
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
