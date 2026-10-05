// 用 socket.io-client 创建连接；MatchSocket 通过构造参数接收它，自身不依赖 socket.io-client

import { io } from 'socket.io-client';
import type { MatchSocketOptions, SocketLike } from './matchSocket';

export const createIoSocket: MatchSocketOptions['createSocket'] = (url, opts): SocketLike =>
  io(url, { ...opts, autoConnect: false, reconnection: true });
