/**
 * Spike 16: 预设短语面板交互验证
 * ADR-025: 20 条预设短语，3s 冷却，全房间可见
 */

let passed = 0, failed = 0;
function check(cond: boolean, name: string, detail = '') {
  if (cond) { console.log(`  ✅ ${name}`); passed++; } else { console.log(`  ❌ ${name} — ${detail}`); failed++; }
}

// 预设短语数据
const PRESETS = [
  { id: 1, text: '解锁这层！', category: 'action' },
  { id: 2, text: '救我！', category: 'help' },
  { id: 3, text: '别打我！', category: 'defense' },
  { id: 4, text: '我有解封牌', category: 'info' },
  { id: 5, text: '梦主在这层！', category: 'info' },
  { id: 6, text: '我来解封', category: 'action' },
  { id: 7, text: '小心！', category: 'warning' },
  { id: 8, text: '别浪费牌', category: 'advice' },
  { id: 9, text: '好险！', category: 'reaction' },
  { id: 10, text: '稳住，我们能赢', category: 'encourage' },
  { id: 11, text: '快解封！', category: 'action' },
  { id: 12, text: '金库在这！', category: 'info' },
  { id: 13, text: '梦主暴露了', category: 'info' },
  { id: 14, text: '我需要牌', category: 'help' },
  { id: 15, text: '集中火力', category: 'action' },
  { id: 16, text: '分散行动', category: 'advice' },
  { id: 17, text: '目标确认', category: 'action' },
  { id: 18, text: '掩护我', category: 'help' },
  { id: 19, text: '手牌快没了', category: 'info' },
  { id: 20, text: '这把稳了！', category: 'encourage' },
];

// 冷却管理器
class CooldownManager {
  private lastUsed = new Map<string, number>();
  private cooldownMs: number;

  constructor(cooldownMs = 3000) { this.cooldownMs = cooldownMs; }

  canSend(playerId: string, now: number): { allowed: boolean; remainingMs: number } {
    const last = this.lastUsed.get(playerId);
    if (last === undefined) return { allowed: true, remainingMs: 0 };
    const remaining = Math.max(0, this.cooldownMs - (now - last));
    return { allowed: remaining === 0, remainingMs: remaining };
  }

  record(playerId: string, now: number) { this.lastUsed.set(playerId, now); }
}

// 广播记录
interface ChatMessage {
  playerId: string;
  playerName: string;
  phraseId: number;
  text: string;
  timestamp: number;
}

class PhraseBroadcaster {
  private messages: ChatMessage[] = [];
  private maxPerPhase = 5; // 每阶段每人上限

  broadcast(playerId: string, playerName: string, phraseId: number, now: number): ChatMessage | null {
    const phrase = PRESETS.find(p => p.id === phraseId);
    if (!phrase) return null;

    // 每阶段发言上限
    const playerMessages = this.messages.filter(m => m.playerId === playerId).length;
    if (playerMessages >= this.maxPerPhase) return null;

    const msg: ChatMessage = { playerId, playerName, phraseId, text: phrase.text, timestamp: now };
    this.messages.push(msg);
    return msg;
  }

  getMessages() { return [...this.messages]; }
}

function main() {
  console.log('\n🧪 Spike 16: 预设短语面板交互\n');

  check(PRESETS.length === 20, `预设短语数量=20 (${PRESETS.length})`);

  // 冷却测试
  const cooldown = new CooldownManager(3000);
  check(cooldown.canSend('p0', 0).allowed, '首次发送允许');
  cooldown.record('p0', 0);

  check(!cooldown.canSend('p0', 1000).allowed, '1s 后冷却中');
  check(cooldown.canSend('p0', 3000).allowed, '3s 后冷却结束');
  check(cooldown.canSend('p1', 500).allowed, '不同玩家不受影响');

  // 广播测试
  const bc = new PhraseBroadcaster();
  const msg = bc.broadcast('0', 'AI苹果', 1, 1000);
  check(msg?.text === '解锁这层！', '广播正确');
  check(bc.getMessages().length === 1, '消息记录=1');

  // 无效短语
  check(bc.broadcast('0', 'test', 99, 2000) === null, '无效短语ID被拒绝');

  // 发言上限
  for (let i = 0; i < 5; i++) bc.broadcast('1', 'test', PRESETS[i].id, 3000 + i);
  check(bc.broadcast('1', 'test', 10, 9000) === null, '超出 5 条/阶段上限');

  // 无阵营私聊（全员可见）
  const allMessages = bc.getMessages();
  const p0Messages = allMessages.filter(m => m.playerId !== '0');
  check(p0Messages.length > 0, '其他玩家的消息对 p0 也可见（无私聊）');

  console.log(`\n📊 ✅ ${passed} / ❌ ${failed}\n`);
}

main();
