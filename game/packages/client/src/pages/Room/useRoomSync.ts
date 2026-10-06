// 房间等待页的实时同步：优先用服务端推送，推送不可用时退回低频轮询
//
// 推送到达后直接写进房间的查询缓存；轮询间隔由 roomPollInterval 决定（推送连着不轮询，页面不可见暂停）。

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '../../lib/api';
import { logger } from '../../lib/logger';
import { realtimeUrl } from '../../lib/realtimeUrl';
import { isMockMode, roomApi, type RoomState } from '../../lib/roomApi';
import { roomKeys, roomPollInterval } from '../../lib/roomQueries';
import { RoomSocket, createRoomIoSocket, type RoomPushStatus } from '../../lib/roomSocket';
import { useDocumentVisible } from '../../hooks/useDocumentVisible';

export interface UseRoomSyncOptions {
  /** 房间码（大写）；没有时不工作 */
  code: string;
  /** 已进入房间之后才开始同步 */
  enabled: boolean;
  /** 服务端告知本人已被移出房间 */
  onRemoved: () => void;
}

export interface RoomSync {
  room: RoomState | null;
  /** 查询房间失败的错误；有旧数据时也会带出，页面可同时展示 */
  error: unknown;
  pushStatus: RoomPushStatus;
}

export function useRoomSync({ code, enabled, onRemoved }: UseRoomSyncOptions): RoomSync {
  const queryClient = useQueryClient();
  const visible = useDocumentVisible();
  const [pushStatus, setPushStatus] = useState<RoomPushStatus>('idle');
  const onRemovedRef = useRef(onRemoved);
  useEffect(() => {
    onRemovedRef.current = onRemoved;
  }, [onRemoved]);

  // 订阅推送；本地模拟房间没有服务端，不连
  useEffect(() => {
    const token = getAuthToken();
    if (!enabled || !code || token === null || isMockMode()) return;
    const socket = new RoomSocket({
      url: realtimeUrl(),
      token,
      code,
      createSocket: createRoomIoSocket,
      onRoom: (room) => queryClient.setQueryData(roomKeys.detail(code), room),
      onStatus: (status) => {
        logger.flow('room', 'push status', { code, status });
        setPushStatus(status);
      },
      onRemoved: () => onRemovedRef.current(),
    });
    socket.connect();
    return () => {
      socket.close();
      setPushStatus('idle');
    };
  }, [enabled, code, queryClient]);

  // 回到前台时立即补取一次（隐藏期间轮询是暂停的）
  const wasVisible = useRef(visible);
  useEffect(() => {
    const returned = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (returned && enabled && code) {
      void queryClient.invalidateQueries({ queryKey: roomKeys.detail(code) });
    }
  }, [visible, enabled, code, queryClient]);

  const query = useQuery({
    queryKey: roomKeys.detail(code),
    queryFn: () => roomApi.getRoom(code),
    enabled: enabled && !!code,
    refetchInterval: roomPollInterval(pushStatus, visible),
  });

  return { room: query.data ?? null, error: query.error, pushStatus };
}
