import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** URL не разрешён к загрузке скрапером (SSRF-защита). */
export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

const BLOCKED_TLDS = [".localhost", ".local", ".internal", ".home.arpa"];

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // частная сеть
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    (a === 169 && b === 254) || // link-local, включая облачные metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // 192.0.0.0/24, 192.0.2.0/24
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast и reserved
  );
}

/** Раскрывает IPv6 в 8 групп по 16 бит; `null` — адрес не разобран. */
function expandIpv6(address: string): number[] | null {
  const [head, tail, ...rest] = address.split("::");
  if (rest.length > 0) {
    return null;
  }

  const parse = (part: string): number[] =>
    part ? part.split(":").map((group) => Number.parseInt(group, 16)) : [];

  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  const filler =
    tail === undefined ? [] : Array(8 - left.length - right.length).fill(0);
  const groups = [...left, ...filler, ...right];
  return groups.length === 8 && groups.every(Number.isInteger) ? groups : null;
}

function isPrivateIpv6(ip: string): boolean {
  const address = ip.toLowerCase().split("%")[0];

  // IPv4-mapped в точечной записи (::ffff:10.0.0.1) проверяем как IPv4.
  const dotted = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted && address.includes(":")) {
    return isPrivateIpv4(dotted[1]);
  }

  const groups = expandIpv6(address);
  if (!groups) {
    return true;
  }

  const isZeroPrefix = groups.slice(0, 5).every((group) => group === 0);
  // IPv4-mapped/-compatible в шестнадцатеричной записи (::ffff:7f00:1).
  if (isZeroPrefix && (groups[5] === 0xffff || groups[5] === 0)) {
    const ipv4 = [
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ].join(".");
    return isPrivateIpv4(ipv4);
  }

  const [first] = groups;
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 // ff00::/8 multicast
  );
}

/** Адрес указывает на локальную, частную или служебную сеть. */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    return isPrivateIpv4(ip);
  }
  if (family === 6) {
    return isPrivateIpv6(ip);
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    BLOCKED_HOSTNAMES.has(host) ||
    BLOCKED_TLDS.some((suffix) => host.endsWith(suffix))
  );
}

/**
 * Проверяет, что URL можно безопасно открыть в скрапере: только http(s),
 * хост не служебный и не разрешается в приватный/loopback/link-local адрес.
 * Защищает внутреннюю сеть и облачные metadata-эндпоинты от SSRF через
 * пользовательский URL сайта.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("Некорректный URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BlockedUrlError("Разрешены только адреса http(s)");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || isBlockedHostname(hostname)) {
    throw new BlockedUrlError("Адрес во внутренней сети недопустим");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new BlockedUrlError("Адрес во внутренней сети недопустим");
    }
    return parsed;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new BlockedUrlError(`Не удалось разрешить домен ${hostname}`);
  }

  if (
    addresses.length === 0 ||
    addresses.some((entry) => isPrivateAddress(entry.address))
  ) {
    throw new BlockedUrlError("Адрес во внутренней сети недопустим");
  }

  return parsed;
}

/** Безопасен ли URL: удобная обёртка над `assertPublicUrl`. */
export async function isPublicUrl(rawUrl: string): Promise<boolean> {
  try {
    await assertPublicUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}
