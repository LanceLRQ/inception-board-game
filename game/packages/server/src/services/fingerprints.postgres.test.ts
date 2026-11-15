import { afterAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { DeviceFingerprintService } from './DeviceFingerprintService.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('设备指纹 · PostgreSQL', () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const fingerprints = new DeviceFingerprintService(prisma);

  afterAll(() => prisma.$disconnect());

  it('并发上报原子累加记录，同设备多账号关联到同一个项目哈希', async () => {
    const players = await prisma.player.createManyAndReturn({
      data: ['指纹登记甲', '指纹登记乙'].map((nickname) => ({ nickname, avatarSeed: 'test' })),
    });
    const [first, second] = players;
    const visitorId = crypto.randomUUID().replaceAll('-', '');
    const where = { playerId: { in: players.map(({ id }) => id) } };
    try {
      await fingerprints.register(first!.id, visitorId);
      const initial = await prisma.deviceFingerprint.findFirstOrThrow({
        where: { playerId: first!.id },
      });
      await Promise.all([
        ...Array.from({ length: 6 }, () => fingerprints.register(first!.id, visitorId)),
        fingerprints.register(second!.id, visitorId),
      ]);
      const records = await prisma.deviceFingerprint.findMany({ where });
      expect(records).toHaveLength(2);
      expect(initial.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(records.map(({ fingerprint }) => fingerprint)).toEqual([
        initial.fingerprint,
        initial.fingerprint,
      ]);
      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            playerId: first!.id,
            firstSeenAt: initial.firstSeenAt,
            seenCount: 7,
            ipSample: null,
            userAgent: null,
          }),
          expect.objectContaining({
            playerId: second!.id,
            seenCount: 1,
            ipSample: null,
            userAgent: null,
          }),
        ]),
      );
      expect(
        +records.find(({ playerId }) => playerId === first!.id)!.lastSeenAt,
      ).toBeGreaterThanOrEqual(+initial.lastSeenAt);
    } finally {
      await prisma.player.deleteMany({ where: { id: { in: players.map(({ id }) => id) } } });
    }
  });
});
