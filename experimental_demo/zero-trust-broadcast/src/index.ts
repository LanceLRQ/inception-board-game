/**
 * Spike 15: 零信任事件广播 Spike
 * ADR-031: 所有 WS 下发事件必须按 playerView 过滤后再推送
 */

let passed = 0, failed = 0;
function check(cond: boolean, name: string, detail = '') {
  if (cond) { console.log(`  ✅ ${name}`); passed++; } else { console.log(`  ❌ ${name} — ${detail}`); failed++; }
}

interface GameEvent {
  type: string;
  actorId: string;
  targetId?: string;
  details: Record<string, any>;
  visibility: 'all' | 'actor-only' | 'actor-and-target' | string[];
}

function filterEventForPlayer(event: GameEvent, playerId: string): GameEvent | null {
  if (event.visibility === 'all') return event;
  if (event.visibility === 'actor-only' && event.actorId === playerId) return event;
  if (event.visibility === 'actor-and-target') {
    if (event.actorId === playerId || event.targetId === playerId) return event;
    // 其他人只看到元信息
    return { type: event.type, actorId: event.actorId, targetId: event.targetId, details: {}, visibility: event.visibility };
  }
  if (Array.isArray(event.visibility) && event.visibility.includes(playerId)) return event;
  return null;
}

function broadcast(events: GameEvent[], playerIds: string[]): Map<string, GameEvent[]> {
  const result = new Map<string, GameEvent[]>();
  for (const pid of playerIds) {
    const filtered = events.map(e => filterEventForPlayer(e, pid)).filter(Boolean) as GameEvent[];
    result.set(pid, filtered);
  }
  return result;
}

function main() {
  console.log('\n🧪 Spike 15: 零信任事件广播\n');

  const players = ['0', '1', '2', '3'];

  // 事件类型测试
  const events: GameEvent[] = [
    { type: 'shoot', actorId: '0', targetId: '1', details: { diceResult: 5, damage: true }, visibility: 'all' },
    { type: 'peek-vault', actorId: '1', details: { vaultContent: 'SECRET', layerId: 2 }, visibility: 'actor-only' },
    { type: 'bribe-dealt', actorId: '0', targetId: '2', details: { isDeal: true }, visibility: 'actor-and-target' },
    { type: 'unlock', actorId: '3', details: { layerId: 1, heartLocksBefore: 3 }, visibility: ['0', '3'] },
  ];

  const result = broadcast(events, players);

  // 测试 1: SHOOT（all）所有人可见完整信息
  const p0events = result.get('0')!;
  check(p0events.some(e => e.type === 'shoot' && e.details.diceResult === 5), 'SHOOT 全员可见完整');

  // 测试 2: peek-vault（actor-only）只有 p1 可见
  const p1events = result.get('1')!;
  const p2events = result.get('2')!;
  check(p1events.some(e => e.type === 'peek-vault' && e.details.vaultContent === 'SECRET'), 'p1 看到金库内容');
  check(!p2events.some(e => e.type === 'peek-vault'), 'p2 看不到 peek-vault 事件');
  check(!p0events.some(e => e.type === 'peek-vault'), 'p0 看不到 peek-vault 事件');

  // 测试 3: bribe-dealt（actor-and-target）
  const p2bribe = p2events.find(e => e.type === 'bribe-dealt')!;
  check(p2bribe?.details.isDeal === true, 'p2(目标)看到贿赂内容');
  const p3events = result.get('3')!;
  const p3bribe = p3events.find(e => e.type === 'bribe-dealt');
  check(p3bribe?.details.isDeal === undefined, 'p3(旁观)只看到元信息，无正反面');

  // 测试 4: unlock（指定玩家）
  check(p0events.some(e => e.type === 'unlock'), 'p0 在 visibility 列表中可见 unlock');
  check(p3events.some(e => e.type === 'unlock'), 'p3 在 visibility 列表中可见 unlock');
  check(!p1events.some(e => e.type === 'unlock'), 'p1 不在列表看不到 unlock');
  check(!p2events.some(e => e.type === 'unlock'), 'p2 不在列表看不到 unlock');

  // 测试 5: 性能（10 人 1000 事件）
  const bigEvents: GameEvent[] = Array.from({ length: 1000 }, (_, i) => ({
    type: i % 2 === 0 ? 'move' : 'action',
    actorId: String(i % 10),
    details: { data: `event-${i}` },
    visibility: i % 3 === 0 ? 'all' as const : 'actor-only' as const,
  }));
  const start = performance.now();
  broadcast(bigEvents, Array.from({ length: 10 }, (_, i) => String(i)));
  const elapsed = performance.now() - start;
  check(elapsed < 50, `10人×1000事件 < 50ms (${elapsed.toFixed(1)}ms)`);

  console.log(`\n📊 ✅ ${passed} / ❌ ${failed}\n`);
}

main();
