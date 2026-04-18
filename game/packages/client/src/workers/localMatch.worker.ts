import * as Comlink from 'comlink';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';

// 空壳游戏定义（Phase 2 替换）
const stubGame = {
  name: 'inception-city-stub',
  setup: () => ({ turn: 0 }),
  moves: {
    endTurn: ({ G }: { G: { turn: number } }) => ({ ...G, turn: G.turn + 1 }),
  },
};

export interface LocalMatchWorker {
  createLocalMatch: (playerCount: number) => Promise<void>;
  getState: () => Promise<unknown>;
  makeMove: (move: string, args: unknown[]) => Promise<void>;
}

let client: ReturnType<typeof Client> | null = null;

const workerApi: LocalMatchWorker = {
  async createLocalMatch(playerCount: number) {
    client = Client({
      game: stubGame,
      numPlayers: playerCount,
      multiplayer: Local(),
      playerID: '0',
    });
    client.start();
  },
  async getState() {
    return client?.getState() ?? null;
  },
  async makeMove(move: string, args: unknown[]) {
    (client?.moves as Record<string, (...a: unknown[]) => void>)?.[move]?.(...args);
  },
};

Comlink.expose(workerApi);
