import { createHash } from 'node:crypto';
import { arch, hostname, networkInterfaces, platform, userInfo } from 'node:os';

const NAMESPACE_PHOENIX_ENDPOINT = Buffer.from('7f6b0f9f91be4cf69d6754b2f2c2f6da', 'hex');

export interface EndpointIdentity {
  deviceId: string;
  hostname: string;
  primaryMac: string;
  macAddresses: string[];
  loggedInUser: string;
  userUid: string;
  userHomeDir: string;
  os: string;
  arch: string;
  idSource: 'hostname_mac' | 'hostname_no_mac';
}

export function collectEndpointIdentity(): EndpointIdentity {
  const macs = collectMacAddresses();
  const overrideMac = (process.env.PHOENIX_ENDPOINT_MAC || '').trim().toLowerCase();
  const endpointMacs = overrideMac ? [overrideMac] : macs;
  let info: ReturnType<typeof userInfo> | undefined;
  try {
    info = userInfo();
  } catch {
    info = undefined;
  }
  return fromHostMAC({
    hostname: process.env.PHOENIX_ENDPOINT_HOSTNAME || hostname(),
    primaryMac: endpointMacs[0] || '',
    macAddresses: endpointMacs,
    loggedInUser: process.env.PHOENIX_LOGGED_IN_USER || process.env.USER || process.env.USERNAME || (info?.username ? String(info.username) : ''),
    userUid: info?.uid === undefined ? '' : String(info.uid),
    userHomeDir: info?.homedir ? String(info.homedir) : '',
  });
}

export function fromHostMAC(input: {
  hostname: string;
  primaryMac: string;
  macAddresses?: string[];
  loggedInUser?: string;
  userUid?: string;
  userHomeDir?: string;
}): EndpointIdentity {
  const normalizedHost = input.hostname.trim().toLowerCase();
  const normalizedMac = input.primaryMac.trim().toLowerCase();
  const name = `${normalizedHost}|${normalizedMac}`;
  return {
    deviceId: uuidV5(name),
    hostname: input.hostname,
    primaryMac: input.primaryMac,
    macAddresses: input.macAddresses ? [...input.macAddresses] : [],
    loggedInUser: input.loggedInUser || '',
    userUid: input.userUid || '',
    userHomeDir: input.userHomeDir || '',
    os: platform(),
    arch: arch(),
    idSource: normalizedMac ? 'hostname_mac' : 'hostname_no_mac',
  };
}

export function endpointMetadata(identity: EndpointIdentity, collector: string): Record<string, string | string[]> {
  return {
    endpoint_id_source: identity.idSource,
    hostname: identity.hostname,
    primary_mac: identity.primaryMac,
    mac_addresses: identity.macAddresses,
    logged_in_user: identity.loggedInUser,
    user_uid: identity.userUid,
    user_home_dir: identity.userHomeDir,
    os: identity.os,
    arch: identity.arch,
    collector,
  };
}

function collectMacAddresses(): string[] {
  const macs = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.internal || !entry.mac || entry.mac === '00:00:00:00:00:00') continue;
      macs.add(entry.mac.toLowerCase());
    }
  }
  return [...macs].sort();
}

function uuidV5(name: string): string {
  const hash = createHash('sha1').update(NAMESPACE_PHOENIX_ENDPOINT).update(name).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [
    bytes.subarray(0, 4).toString('hex'),
    bytes.subarray(4, 6).toString('hex'),
    bytes.subarray(6, 8).toString('hex'),
    bytes.subarray(8, 10).toString('hex'),
    bytes.subarray(10, 16).toString('hex'),
  ].join('-');
}
