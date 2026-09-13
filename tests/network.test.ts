import { describe, expect, it } from 'vitest';
import { isPublicAddress, NetworkPolicyError, resolvePublicDestination } from '../packages/core/src/network';

describe('network policy', () => {
  it('rejects private, mapped and reserved addresses', () => {
    for (const address of ['127.0.0.1', '10.0.0.4', '172.16.0.1', '192.168.1.1', '169.254.10.4', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    expect(isPublicAddress('93.184.216.34')).toBe(true);
  });

  it('rejects mixed DNS answers instead of selecting a public answer', async () => {
    await expect(resolvePublicDestination('mixed.example', 443, async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.1.10', family: 4 }
    ])).rejects.toMatchObject<NetworkPolicyError>({ code: 'NETWORK_DNS_BLOCKED' });
  });

  it('rejects non-web ports before DNS resolution', async () => {
    await expect(resolvePublicDestination('example.com', 8080, async () => {
      throw new Error('DNS should not be called');
    })).rejects.toMatchObject<NetworkPolicyError>({ code: 'NETWORK_PORT_BLOCKED' });
  });
});
