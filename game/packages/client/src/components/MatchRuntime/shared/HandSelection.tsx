import { createContext, useContext, useState, type ReactNode } from 'react';
import type { MatchController, HandCardItem } from '../controllerTypes';

interface HandSelection {
  readonly readingItem: HandCardItem | null;
  readonly select: (index: number | null) => void;
}
const Context = createContext<HandSelection | null>(null);

/** 选牌跨响应式布局保留；对局、座位、阶段或手牌改变后失效，包括相邻同名牌。 */
export function HandSelectionProvider({
  controller,
  children,
}: {
  controller: MatchController;
  children: ReactNode;
}) {
  const { hand, turn, self, view } = controller;
  const stamp = JSON.stringify([
    view?.matchId,
    self?.seat,
    turn.number,
    turn.phase,
    hand.items.map((i) => i.card),
  ]);
  const [reading, setReading] = useState<{ index: number; stamp: string } | null>(null);
  const readingItem = reading?.stamp === stamp ? (hand.items[reading.index] ?? null) : null;
  return (
    <Context.Provider
      value={{
        readingItem,
        select: (index) => setReading(index === null ? null : { index, stamp }),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useHandSelection(): HandSelection {
  const value = useContext(Context);
  if (!value) throw new Error('HandSelectionProvider is required');
  return value;
}
