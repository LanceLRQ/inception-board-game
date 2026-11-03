import { expect, it } from 'vitest';
import { rememberVaults } from './vaultMemory';
import type { StageVault } from './stageState';
const hidden: StageVault = { id: 'v1', layer: 3, contentType: 'hidden', isOpened: false };
it('只记住已接收的信息，关闭窥视后仍可阅读，不为未知金库猜内容', () => {
  const first = rememberVaults(null, 'match:seat', [hidden]);
  expect(first.vaults[0]!.contentType).toBe('hidden');
  const peek = rememberVaults(first, 'match:seat', [{ ...hidden, contentType: 'secret' }]);
  const acknowledged = rememberVaults(peek, 'match:seat', [hidden]);
  expect(acknowledged.vaults[0]!.contentType).toBe('secret');
  expect(acknowledged.vaults[0]!.isOpened).toBe(false);
});
it('切换对局或座位清空私密记忆，公开状态始终采用最新视图', () => {
  const first = rememberVaults(null, 'match:seat', [{ ...hidden, contentType: 'secret' }]);
  expect(rememberVaults(first, 'match:other', [hidden]).vaults[0]!.contentType).toBe('hidden');
  expect(rememberVaults(first, 'other:seat', [hidden]).vaults[0]!.contentType).toBe('hidden');
  expect(
    rememberVaults(first, 'match:seat', [{ ...hidden, isOpened: true, contentType: 'secret' }])
      .vaults[0]!.isOpened,
  ).toBe(true);
});
