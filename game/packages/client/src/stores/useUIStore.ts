import { create } from 'zustand';

interface UIState {
  isHandDrawerOpen: boolean;
  isSettingsOpen: boolean;
  activeTab: 'game' | 'chat' | 'players';
  setHandDrawerOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveTab: (tab: UIState['activeTab']) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isHandDrawerOpen: false,
  isSettingsOpen: false,
  activeTab: 'game',
  setHandDrawerOpen: (open) => set({ isHandDrawerOpen: open }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
