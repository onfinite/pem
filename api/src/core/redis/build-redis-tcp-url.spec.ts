import { buildRedisTcpUrlFromUpstashRest } from '@/core/redis/build-redis-tcp-url';

describe('buildRedisTcpUrlFromUpstashRest', () => {
  it('returns undefined when args missing', () => {
    expect(buildRedisTcpUrlFromUpstashRest(undefined, 't')).toBeUndefined();
    expect(buildRedisTcpUrlFromUpstashRest('https://x.upstash.io', '')).toBeUndefined();
  });

  it('builds rediss URL from https REST host and token', () => {
    expect(
      buildRedisTcpUrlFromUpstashRest(
        'https://my-db-12345.us-east-1.upstash.io',
        'plain-token',
      ),
    ).toBe(
      'rediss://default:plain-token@my-db-12345.us-east-1.upstash.io:6379',
    );
  });

  it('encodes special characters in the token', () => {
    expect(
      buildRedisTcpUrlFromUpstashRest('https://h.upstash.io', 'a/b+c'),
    ).toBe('rediss://default:a%2Fb%2Bc@h.upstash.io:6379');
  });

  it('rejects non-https REST URLs', () => {
    expect(
      buildRedisTcpUrlFromUpstashRest('http://h.upstash.io', 't'),
    ).toBeUndefined();
  });
});
