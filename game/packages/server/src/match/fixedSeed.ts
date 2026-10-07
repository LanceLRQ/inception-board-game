// 联机对局的固定种子：只给端到端测试用，由服务端进程的环境变量注入
//
// 种子决定金库内容、牌库顺序、角色分配与骰子，是联机对局里最核心的秘密，
// 所以：客户端绝不能指定它，也不能出现在任何下发给客户端的数据里；
// 生产环境（NODE_ENV=production）下既不接受这个变量，也不允许把它接进对局服务。

/** 环境变量名 */
export const FIXED_MATCH_SEED_ENV = 'MATCH_FIXED_SEED';

/** 种子的合法字符与长度：字母、数字、点、下划线、连字符，1–128 位 */
const SEED_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * 读取固定种子：没配置返回 undefined（走随机种子）；
 * 配置了返回一个每次给出同一个种子的函数，可直接作为对局服务的取种子依赖。
 * 生产环境配置了该变量、或格式不合法时抛错，让进程拒绝启动。
 */
export function resolveFixedMatchSeed(env: NodeJS.ProcessEnv): (() => string) | undefined {
  const raw = env[FIXED_MATCH_SEED_ENV];
  if (raw === undefined || raw === '') return undefined;
  if (env.NODE_ENV === 'production') {
    throw new Error(`${FIXED_MATCH_SEED_ENV} 只能用于测试，生产环境不允许配置`);
  }
  if (!SEED_PATTERN.test(raw)) {
    throw new Error(`${FIXED_MATCH_SEED_ENV} 只能含字母、数字、点、下划线与连字符，长度 1–128`);
  }
  return () => raw;
}
