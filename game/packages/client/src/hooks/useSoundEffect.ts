// useSoundEffect - 读 useAudioStore 偏好 → 播放音效
// 对照：plans/design/06-frontend-design.md §6.19.5

import { useCallback } from 'react';
import { getAudioManager, type SoundKey } from '../lib/audio.js';
import { useAudioStore } from '../stores/useAudioStore.js';

/** 返回一个稳定的 play(key) 函数，自动读当前音量/静音偏好 */
export function useSoundEffect(): (key: SoundKey) => void {
  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);
  return useCallback(
    (key: SoundKey) => {
      getAudioManager().play(key, { volume, muted });
    },
    [volume, muted],
  );
}
