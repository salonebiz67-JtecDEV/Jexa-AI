import dns from 'node:dns/promises';
import net from 'node:net';
import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';

export interface OpenLinkToolArgs {
  url: string;
}

export interface OpenLinkToolData {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  contentLength: number;
  redirectsFollowed: number;
  truncated: boolean;
  bytesRead: number;
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = Math.floor(1.5 * 1024 * 1024); // 1.5 MB
const MAX_REDIRECTS = 3;
const MAX_READABLE_CHARS = 6_000;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
  '169.254.169.254',
  '100.100.100.200',
]);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 100.64.0.0/10 (Carrier-grade NAT & cloud internal e.g. 100.100.100.200)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local & AWS/GCP/Azure metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 & 240.0.0.0/4 (Multicast, Reserved, Broadcast 255.255.255.255)
  if (a >= 224) return true;

  return false;
}

function normalizeIpv6Address(ip: string): string {
  const withoutZone = ip.split('%')[0].toLowerCase();
  return withoutZone;
}

function isPrivateOrReservedIpv6(rawIp: string): boolean {
  const ip = normalizeIpv6Address(rawIp);

  // Exact unspecified or loopback
  if (ip === '::' || ip === '::1' || ip === '0:0:0:0:0:0:0:0' || ip === '0:0:0:0:0:0:0:1') {
    return true;
  }

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (ip.startsWith('::ffff:')) {
    const tail = ip.slice('::ffff:'.length);
    if (net.isIPv4(tail)) {
      return isPrivateOrReservedIpv4(tail);
    }
    const hexPair = tail.split(':');
    if (hexPair.length === 2) {
      const hi = parseInt(hexPair[0], 16);
      const lo = parseInt(hexPair[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrReservedIpv4(ipv4);
      }
    }
    return true;
  }

  // Unique local IPv6 (fc00::/7 — includes AWS IPv6 metadata fd00:ec2::254)
  if (ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  // Link-local IPv6 (fe80::/10)
  if (/^fe[89ab][0-9a-f]/i.test(ip)) {
    return true;
  }

  // Multicast IPv6 (ff00::/8)
  if (ip.startsWith('ff')) {
    return true;
  }

  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateOrReservedIpv4(ip);
  if (version === 6) return isPrivateOrReservedIpv6(ip);
  return true;
}

async function validatePublicHttpUrl(rawUrl: string): Promise<{ valid: boolean; url?: string; error?: string }> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'A valid http:// or https:// URL is required.' };
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: `Protocol "${parsed.protocol}" is blocked. Only http and https URLs are allowed.` };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs containing embedded credentials are not allowed.' };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
  if (!hostname) {
    return { valid: false, error: 'URL must contain a valid hostname.' };
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localdomain')
  ) {
    return { valid: false, error: `Access to internal or metadata host "${hostname}" is blocked.` };
  }

  // If hostname is already an IP literal (IPv4 or IPv6), check directly
  if (net.isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      return { valid: false, error: `Access to private, loopback, or metadata IP "${hostname}" is blocked.` };
    }
    return { valid: true, url: parsed.toString() };
  }

  // Resolve DNS records and block if any resolved IP is private, loopback, or cloud metadata
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { valid: false, error: `Could not resolve hostname "${hostname}".` };
    }
    for (const rec of records) {
      if (isBlockedIp(rec.address)) {
        return {
          valid: false,
          error: `Host "${hostname}" resolves to a blocked private or metadata address.`,
        };
      }
    }
  } catch (err: any) {
    return {
      valid: false,
      error: `DNS lookup failed for "${hostname}": ${err?.message || 'Unable to resolve host'}`,
    };
  }

  return { valid: true, url: parsed.toString() };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function extractReadablePageContent(
  rawBody: string,
  contentType: string,
  fallbackUrl: string
): { title: string; text: string } {
  const lowerType = contentType.toLowerCase();

  if (lowerType.includes('application/json')) {
    try {
      const parsed = JSON.parse(rawBody);
      return {
        title: fallbackUrl,
        text: JSON.stringify(parsed, null, 2),
      };
    } catch {
      return { title: fallbackUrl, text: rawBody.trim() };
    }
  }

  if (lowerType.startsWith('text/plain') || lowerType.startsWith('text/markdown') || lowerType.startsWith('text/csv')) {
    return {
      title: fallbackUrl,
      text: rawBody.replace(/\r\n/g, '\n').trim(),
    };
  }

  // Extract <title>
  const titleMatch = rawBody.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1] : '';
  const title = decodeHtmlEntities(rawTitle.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) || fallbackUrl;

  // Strip non-readable sections
  let stripped = rawBody
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|aside|header|h[1-6]|li|tr|blockquote|pre)>/gi, '\n');

  stripped = stripped.replace(/<[^>]+>/g, ' ');
  stripped = decodeHtmlEntities(stripped);

  const normalizedLines = stripped
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0);

  return {
    title,
    text: normalizedLines.join('\n'),
  };
}

export const openLinkTool: InternalToolDefinition<OpenLinkToolArgs, OpenLinkToolData> = {
  name: 'open_link',
  displayName: 'Open Link',
  description: 'Fetch a public http or https webpage and return its title and readable text (up to 6,000 characters).',
  category: 'search',
  permissionLevel: 'read_only',
  timeoutMs: 12000,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The public http:// or https:// webpage URL to open and read.',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  isAvailable: (): boolean => true,
  execute: async (
    args: OpenLinkToolArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<OpenLinkToolData>> => {
    const startTime = Date.now();
    context.onStatusUpdate?.('Opening page…', { query: args?.url });

    const requestedUrl = (args?.url || '').trim();
    if (!requestedUrl) {
      return {
        success: false,
        toolName: 'open_link',
        error: 'A valid http or https URL is required.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const onExternalAbort = () => controller.abort();
    context.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      let currentUrl = requestedUrl;
      let redirectsFollowed = 0;
      let finalResponse: Response | null = null;

      while (true) {
        const check = await validatePublicHttpUrl(currentUrl);
        if (!check.valid || !check.url) {
          return {
            success: false,
            toolName: 'open_link',
            error: check.error || 'URL validation failed.',
            executionTimeMs: Date.now() - startTime,
          };
        }
        currentUrl = check.url;

        const resp = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; JEXA/1.0; +https://github.com)',
            'Accept': 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
        });

        // Handle HTTP 3xx redirects manually and re-check each Location target
        if (resp.status >= 300 && resp.status < 400) {
          try {
            await resp.body?.cancel();
          } catch {
            // ignore
          }

          const location = resp.headers.get('location');
          if (!location) {
            return {
              success: false,
              toolName: 'open_link',
              error: `Redirect response (HTTP ${resp.status}) had no Location header.`,
              executionTimeMs: Date.now() - startTime,
            };
          }

          if (redirectsFollowed >= MAX_REDIRECTS) {
            return {
              success: false,
              toolName: 'open_link',
              error: `Too many redirects (maximum ${MAX_REDIRECTS} redirects allowed).`,
              executionTimeMs: Date.now() - startTime,
            };
          }

          let nextUrl: string;
          try {
            nextUrl = new URL(location, currentUrl).toString();
          } catch {
            return {
              success: false,
              toolName: 'open_link',
              error: 'Redirect pointed to a malformed URL.',
              executionTimeMs: Date.now() - startTime,
            };
          }

          redirectsFollowed++;
          currentUrl = nextUrl;
          continue;
        }

        finalResponse = resp;
        break;
      }

      if (!finalResponse) {
        return {
          success: false,
          toolName: 'open_link',
          error: 'No response received from target URL.',
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (!finalResponse.ok) {
        try {
          await finalResponse.body?.cancel();
        } catch {
          // ignore
        }
        return {
          success: false,
          toolName: 'open_link',
          error: `Page returned HTTP ${finalResponse.status}${finalResponse.statusText ? ` ${finalResponse.statusText}` : ''}.`,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const contentType = (finalResponse.headers.get('content-type') || 'text/html').trim();
      const lowerType = contentType.toLowerCase();
      const isReadableType =
        lowerType.includes('text/') ||
        lowerType.includes('html') ||
        lowerType.includes('xml') ||
        lowerType.includes('json') ||
        !lowerType;

      if (!isReadableType) {
        try {
          await finalResponse.body?.cancel();
        } catch {
          // ignore
        }
        return {
          success: false,
          toolName: 'open_link',
          error: `Unsupported content type "${contentType.split(';')[0]}". Only readable web pages and text are supported.`,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const contentLengthHeader = finalResponse.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredSize = Number(contentLengthHeader);
        if (Number.isFinite(declaredSize) && declaredSize > MAX_DOWNLOAD_BYTES) {
          try {
            await finalResponse.body?.cancel();
          } catch {
            // ignore
          }
          return {
            success: false,
            toolName: 'open_link',
            error: `Page exceeds the 1.5 MB size limit (${Math.round(declaredSize / 1024)} KB).`,
            executionTimeMs: Date.now() - startTime,
          };
        }
      }

      // Stream response body up to MAX_DOWNLOAD_BYTES (1.5 MB)
      const chunks: Uint8Array[] = [];
      let bytesRead = 0;
      let hitSizeLimit = false;

      if (finalResponse.body) {
        const reader = finalResponse.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.byteLength === 0) continue;

            if (bytesRead + value.byteLength > MAX_DOWNLOAD_BYTES) {
              const remaining = MAX_DOWNLOAD_BYTES - bytesRead;
              if (remaining > 0) {
                chunks.push(value.subarray(0, remaining));
                bytesRead += remaining;
              }
              hitSizeLimit = true;
              await reader.cancel().catch(() => {});
              break;
            }

            chunks.push(value);
            bytesRead += value.byteLength;
          }
        } finally {
          reader.releaseLock();
        }
      }

      if (hitSizeLimit && bytesRead >= MAX_DOWNLOAD_BYTES) {
        // Ensure raw text didn't exceed 1.5MB silently; extract what we safely downloaded or reject if unparseable
      }

      const combined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      const rawBody = combined.toString('utf8');
      const extracted = extractReadablePageContent(rawBody, contentType, currentUrl);

      if (!extracted.text || extracted.text.length === 0) {
        return {
          success: false,
          toolName: 'open_link',
          error: hitSizeLimit
            ? 'Page exceeded 1.5 MB limit before readable text could be extracted.'
            : 'No readable text content was found on this page.',
          executionTimeMs: Date.now() - startTime,
        };
      }

      const textTruncated = extracted.text.length > MAX_READABLE_CHARS;
      const finalText = textTruncated
        ? extracted.text.slice(0, MAX_READABLE_CHARS)
        : extracted.text;

      return {
        success: true,
        toolName: 'open_link',
        data: {
          url: requestedUrl,
          finalUrl: currentUrl,
          title: extracted.title,
          text: finalText,
          contentLength: finalText.length,
          redirectsFollowed,
          truncated: textTruncated || hitSizeLimit,
          bytesRead,
        },
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError' || controller.signal.aborted;
      return {
        success: false,
        toolName: 'open_link',
        error: isTimeout
          ? 'Opening page timed out after 10 seconds.'
          : `Failed to open link: ${err?.message || 'Unknown network error'}`,
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeoutId);
      context.signal?.removeEventListener('abort', onExternalAbort);
    }
  },
};
