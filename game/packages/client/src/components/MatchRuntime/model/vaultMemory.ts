import type { StageVault } from './stageState';

export interface VaultMemory {
  readonly scope: string;
  readonly vaults: readonly StageVault[];
}

/** 仅记忆座位视图实际透传的牌面；不写入共享状态或持久存储。 */
export function rememberVaults(
  previous: VaultMemory | null,
  scope: string,
  vaults: readonly StageVault[],
): VaultMemory {
  const known = new Map(
    previous?.scope === scope ? previous.vaults.map((v) => [v.id, v.contentType]) : [],
  );
  return {
    scope,
    vaults: vaults.map((vault) => ({
      ...vault,
      contentType:
        vault.contentType === 'hidden' ? (known.get(vault.id) ?? 'hidden') : vault.contentType,
    })),
  };
}
