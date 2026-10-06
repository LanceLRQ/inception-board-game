import { describe, it, expect } from 'vitest';
import { signToken } from '../infra/jwt.js';
import { AppError } from '../infra/errors.js';
import { isComplete, loadFinishedMatch, optionalAccountId, toStepView } from './archiveEvents.js';
import {
  ACCOUNT_OUTSIDER,
  ACCOUNT_SEAT1,
  FINISHED_ID,
  RUNNING_ID,
  SEAT1_SECRET,
  seedArchive,
} from '../testing/archiveFixture.js';

describe('optionalAccountId', () => {
  it('有效令牌给出账号 id', () => {
    const t = signToken({ playerId: 'p1', nickname: 'x' });
    expect(optionalAccountId(`Bearer ${t}`)).toBe('p1');
  });

  it('没有头、格式不对、令牌无效都给 null 而不抛', () => {
    expect(optionalAccountId(undefined)).toBeNull();
    expect(optionalAccountId('Basic abc')).toBeNull();
    expect(optionalAccountId('Bearer garbage')).toBeNull();
  });
});

describe('loadFinishedMatch', () => {
  it('不存在 → NOT_FOUND；未结束 → CONFLICT', async () => {
    const archive = await seedArchive();
    await expect(loadFinishedMatch(archive, 'nope', null)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(loadFinishedMatch(archive, RUNNING_ID, ACCOUNT_SEAT1)).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(loadFinishedMatch(archive, RUNNING_ID, ACCOUNT_SEAT1)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('成员得到自己的座位号；非成员与未登录得到 null；Bot 座位没有账号可对上', async () => {
    const archive = await seedArchive();
    expect((await loadFinishedMatch(archive, FINISHED_ID, ACCOUNT_SEAT1)).viewer).toBe('1');
    expect((await loadFinishedMatch(archive, FINISHED_ID, ACCOUNT_OUTSIDER)).viewer).toBeNull();
    expect((await loadFinishedMatch(archive, FINISHED_ID, null)).viewer).toBeNull();
  });
});

describe('toStepView', () => {
  it('只含版本号、时间与裁剪后的事件，不含 request', async () => {
    const archive = await seedArchive();
    const { steps } = await loadFinishedMatch(archive, FINISHED_ID, null);
    const view = toStepView(steps[0]!, null);
    expect(Object.keys(view).sort()).toEqual(['at', 'events', 'stateID']);
    expect(JSON.stringify(view)).not.toContain(SEAT1_SECRET);
    expect(JSON.stringify(toStepView(steps[0]!, '1'))).toContain(SEAT1_SECRET);
  });
});

describe('记录完整性', () => {
  it('完整的归档：complete 为 true，gaps 为空', async () => {
    const archive = await seedArchive();
    const res = await loadFinishedMatch(archive, FINISHED_ID, null);
    expect(res.complete).toBe(true);
    expect(res.gaps).toEqual([]);
  });

  it('有缺口记录：complete 为 false，gaps 原样给出', async () => {
    const archive = await seedArchive();
    await archive.recordGap(FINISHED_ID, 6, 8);
    const res = await loadFinishedMatch(archive, FINISHED_ID, null);
    expect(res.complete).toBe(false);
    expect(res.gaps).toEqual([{ from: 6, to: 8 }]);
  });

  it('isComplete：必须从 1 起连续；步号断开或不从 1 开始、没有步都不完整', () => {
    const step = (stateID: number) => ({ stateID }) as never;
    expect(isComplete([step(1), step(2), step(3)], [])).toBe(true);
    expect(isComplete([step(1), step(3)], [])).toBe(false);
    expect(isComplete([step(2), step(3)], [])).toBe(false);
    expect(isComplete([], [])).toBe(false);
    expect(isComplete([step(1)], [{ from: 2, to: 2 }])).toBe(false);
  });
});
