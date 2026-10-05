// 经 boardgame.io 客户端建局的测试用：客户端不能传 setupData，
// 这里把引擎定义的 setup 包一层，补上显式的 rngSeed。

import { InceptionCityGame } from '../game.js';

export function seededGame(rngSeed: string): typeof InceptionCityGame {
  return {
    ...InceptionCityGame,
    setup: (context: { ctx: { numPlayers: number } }, setupData?: Record<string, unknown>) =>
      InceptionCityGame.setup(context, { rngSeed, ...setupData }),
  };
}
