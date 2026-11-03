import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DrawPreferences {
  autoDraw: boolean;
  setAutoDraw: (enabled: boolean) => void;
}

export const useDrawStore = create<DrawPreferences>()(
  persist(
    (set) => ({
      autoDraw: true,
      setAutoDraw: (autoDraw) => set({ autoDraw }),
    }),
    {
      name: 'ico:draw:prefs',
      partialize: ({ autoDraw }) => ({ autoDraw }),
    },
  ),
);
