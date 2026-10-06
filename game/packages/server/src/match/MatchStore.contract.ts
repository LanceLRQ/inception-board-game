// 对局快照存储的契约测试：每个实现都要通过同一套用例
import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { createMatch, type MatchState } from '@icgame/game-engine/runner';
import type { MatchSnapshot, MatchStore } from './MatchStore.js';

export function makeTestState(numPlayers = 4, seed = 'contract-seed'): MatchState<SetupState> {
  return createMatch(InceptionCityGame, { numPlayers, setupData: { rngSeed: seed }, seed });
}

export function makeTestSnapshot(matchID: string, numPlayers = 4): MatchSnapshot {
  const seed = 'contract-seed';
  return {
    matchID,
    roomCode: 'ROOM01',
    seats: Array.from({ length: numPlayers }, (_, i) => ({
      seat: String(i),
      playerId: i === 0 ? 'account-0' : null,
      nickname: `玩家${i}`,
      isBot: i !== 0,
    })),
    setup: { numPlayers, seed, setupData: { rngSeed: seed } },
    state: makeTestState(numPlayers, seed),
    createdAt: 1000,
    updatedAt: 1000,
  };
}

export function describeMatchStoreContract(
  name: string,
  make: () => Promise<MatchStore> | MatchStore,
): void {
  describe(`${name} · 快照存储契约`, () => {
    it('create 后 load 取回深相等的快照', async () => {
      const store = await make();
      const snap = makeTestSnapshot('m-load');
      await store.create(snap);
      expect(await store.load('m-load')).toEqual(snap);
    });

    it('load 不存在的对局返回 null', async () => {
      const store = await make();
      expect(await store.load('nope')).toBeNull();
    });

    it('create 返回 created；同 id 再 create 返回 replaced 且内容是新的', async () => {
      const store = await make();
      const snap = makeTestSnapshot('m-dup');
      expect(await store.create(snap)).toBe('created');
      expect(await store.create({ ...snap, roomCode: 'OTHER' })).toBe('replaced');
      expect((await store.load('m-dup'))?.roomCode).toBe('OTHER');
      expect(await store.listActive()).toEqual(['m-dup']);
    });

    it('discard 后 load 为 null 且不在活跃集合；不存在的对局 discard 也成功', async () => {
      const store = await make();
      await store.create(makeTestSnapshot('m-del'));
      await store.create(makeTestSnapshot('m-keep'));
      await store.discard('m-del');
      expect(await store.load('m-del')).toBeNull();
      expect(await store.listActive()).toEqual(['m-keep']);
      await expect(store.discard('never-existed')).resolves.toBeUndefined();
    });

    it('finish 过的对局可以再 create，并重新出现在活跃集合里', async () => {
      const store = await make();
      await store.create(makeTestSnapshot('m-again'));
      await store.finish('m-again');
      expect(await store.listActive()).toEqual([]);
      expect(await store.create({ ...makeTestSnapshot('m-again'), roomCode: 'NEXT' })).toBe(
        'replaced',
      );
      expect(await store.listActive()).toEqual(['m-again']);
      expect((await store.load('m-again'))?.roomCode).toBe('NEXT');
    });

    it('load 返回的对象与库内数据不共享引用', async () => {
      const store = await make();
      const snap = makeTestSnapshot('m-ref');
      await store.create(snap);
      const a = await store.load('m-ref');
      expect(a).not.toBeNull();
      a!.roomCode = 'MUTATED';
      a!.state.stateID = 999;
      a!.seats[0]!.nickname = 'MUTATED';
      const b = await store.load('m-ref');
      expect(b).toEqual(snap);
    });

    it('create 之后调用方改动传入对象不影响库内数据', async () => {
      const store = await make();
      const snap = makeTestSnapshot('m-in');
      await store.create(snap);
      snap.roomCode = 'MUTATED';
      expect((await store.load('m-in'))?.roomCode).toBe('ROOM01');
    });

    it('save 版本相符时写入新状态并更新 updatedAt', async () => {
      const store = await make();
      const snap = makeTestSnapshot('m-save');
      await store.create(snap);
      const next = { ...snap.state, stateID: snap.state.stateID + 1 };
      const r = await store.save('m-save', next, snap.state.stateID, 2000);
      expect(r).toBe('ok');
      const loaded = await store.load('m-save');
      expect(loaded?.state).toEqual(next);
      expect(loaded?.updatedAt).toBe(2000);
      expect(loaded?.createdAt).toBe(1000);
      expect(loaded?.seats).toEqual(snap.seats);
    });

    it('save 版本不符返回 conflict 且不改库', async () => {
      const store = await make();
      const snap = makeTestSnapshot('m-conflict');
      await store.create(snap);
      const next = { ...snap.state, stateID: snap.state.stateID + 1 };
      const r = await store.save('m-conflict', next, snap.state.stateID + 5, 2000);
      expect(r).toBe('conflict');
      expect(await store.load('m-conflict')).toEqual(snap);
    });

    it('同一版本连续保存两次，第二次因版本已前进而冲突', async () => {
      const store = await make();
      const snap = makeTestSnapshot('m-twice');
      await store.create(snap);
      const base = snap.state.stateID;
      const s1 = { ...snap.state, stateID: base + 1 };
      expect(await store.save('m-twice', s1, base, 2000)).toBe('ok');
      expect(await store.save('m-twice', { ...snap.state, stateID: base + 1 }, base, 3000)).toBe(
        'conflict',
      );
      expect((await store.load('m-twice'))?.updatedAt).toBe(2000);
    });

    it('save 不存在的对局返回 conflict', async () => {
      const store = await make();
      const snap = makeTestSnapshot('m-none');
      expect(await store.save('m-none', snap.state, 0, 1)).toBe('conflict');
    });

    it('create 后进入活跃集合，finish 后移出但快照仍可读取', async () => {
      const store = await make();
      await store.create(makeTestSnapshot('m-a'));
      await store.create(makeTestSnapshot('m-b'));
      expect((await store.listActive()).sort()).toEqual(['m-a', 'm-b']);
      await store.finish('m-a');
      expect(await store.listActive()).toEqual(['m-b']);
      expect(await store.load('m-a')).not.toBeNull();
    });
  });
}
