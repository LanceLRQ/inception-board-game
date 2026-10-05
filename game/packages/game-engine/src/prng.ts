// 对局随机数：基于 ChaCha20 块函数的密码学强度伪随机流。
//
// 为什么不用 32 位的小型发生器：开局的洗牌结果决定金库内容、贿赂牌成败、梦魇与牌库顺序，
// 这些都是对局里的秘密。若状态只有 32 位，玩家用自己公开可见的几个输出就能离线穷举出
// 内部状态，再把整条流续算出来。这里的密钥是 256 位，流的输出不暴露密钥，
// 不同用途（标签）用不同的 nonce 取得互相独立的流。
//
// 约束：纯函数、同步、无依赖，浏览器与 Node 通用。

const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574] as const; // "expand 32-byte k"

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function quarterRound(s: Uint32Array, a: number, b: number, c: number, d: number): void {
  s[a] = (s[a]! + s[b]!) >>> 0;
  s[d] = rotl(s[d]! ^ s[a]!, 16);
  s[c] = (s[c]! + s[d]!) >>> 0;
  s[b] = rotl(s[b]! ^ s[c]!, 12);
  s[a] = (s[a]! + s[b]!) >>> 0;
  s[d] = rotl(s[d]! ^ s[a]!, 8);
  s[c] = (s[c]! + s[d]!) >>> 0;
  s[b] = rotl(s[b]! ^ s[c]!, 7);
}

/**
 * ChaCha20 块函数（20 轮，状态布局同 RFC 8439）。
 * 状态：4 个常量字、8 个密钥字、1 个块计数器、3 个 nonce 字，均为小端 32 位字。
 * 返回 16 个字；按小端展开即是该块的 64 字节密钥流。
 */
export function chacha20Block(
  key: Uint32Array,
  counter: number,
  nonce: readonly [number, number, number],
): Uint32Array {
  const init = new Uint32Array(16);
  init.set(SIGMA, 0);
  init.set(key.subarray(0, 8), 4);
  init[12] = counter >>> 0;
  init[13] = nonce[0] >>> 0;
  init[14] = nonce[1] >>> 0;
  init[15] = nonce[2] >>> 0;
  const s = Uint32Array.from(init);
  for (let i = 0; i < 10; i++) {
    quarterRound(s, 0, 4, 8, 12);
    quarterRound(s, 1, 5, 9, 13);
    quarterRound(s, 2, 6, 10, 14);
    quarterRound(s, 3, 7, 11, 15);
    quarterRound(s, 0, 5, 10, 15);
    quarterRound(s, 1, 6, 11, 12);
    quarterRound(s, 2, 7, 8, 13);
    quarterRound(s, 3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i++) s[i] = (s[i]! + init[i]!) >>> 0;
  return s;
}

/**
 * cyrb128 字符串摊散：把任意字符串混成 4 个 32 位字。
 * 它不需要抗碰撞，只用来把种子字符串铺满密钥空间；输出不会被直接暴露。
 */
function cyrb128(
  str: string,
  init: readonly [number, number, number, number],
): [number, number, number, number] {
  let [h1, h2, h3, h4] = init;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const mix = h1 ^ h2 ^ h3 ^ h4;
  return [(h1 ^ mix) >>> 0, (h2 ^ mix) >>> 0, (h3 ^ mix) >>> 0, (h4 ^ mix) >>> 0];
}

const KEY_INIT_A = [1779033703, 3144134277, 1013904242, 2773480762] as const;
const KEY_INIT_B = [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344] as const;
const NONCE_INIT = [0xa4093822, 0x299f31d0, 0x082efa98, 0xec4e6c89] as const;

/** 把任意字符串种子摊成 256 位密钥（8 个 32 位字） */
export function deriveKey(seed: string): Uint32Array {
  const key = new Uint32Array(8);
  key.set(cyrb128(seed, KEY_INIT_A), 0);
  key.set(cyrb128(seed, KEY_INIT_B), 4);
  return key;
}

/** 把流标签摊成 96 位 nonce；同一密钥下不同标签得到互相独立的流 */
export function labelNonce(label: string): [number, number, number] {
  const [a, b, c] = cyrb128(label, NONCE_INIT);
  return [a, b, c];
}

export interface RandomStream {
  /** 下一个 [0, 1) 的数：取一个块的第一个 32 位字除以 2^32，然后计数器加一 */
  next(): number;
  /** 当前的块计数器，即已经取走的块数（加上起始值） */
  counter(): number;
}

/** 从指定密钥、nonce 与起始计数器建一条流；每次取数用一个块，不做块内缓冲 */
export function createStream(
  key: Uint32Array,
  nonce: readonly [number, number, number],
  counter = 0,
): RandomStream {
  let c = counter >>> 0;
  return {
    next: () => {
      const word = chacha20Block(key, c, nonce)[0]!;
      c = (c + 1) >>> 0;
      return word / 4294967296;
    },
    counter: () => c,
  };
}

/** Fisher–Yates 洗牌，不改入参 */
export function shuffleWith<T>(input: readonly T[], next: () => number): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 便捷洗牌：由种子与标签确定的独立流洗一遍 */
export function seededShuffle<T>(input: readonly T[], seed: string, label: string): T[] {
  return shuffleWith(input, createStream(deriveKey(seed), labelNonce(label)).next);
}
