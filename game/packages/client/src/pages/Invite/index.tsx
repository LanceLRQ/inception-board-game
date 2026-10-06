// 邀请链接落地页：生产环境里 /invite/:code 先由服务端处理（分享卡片或跳转）；
// 没有服务端接住时（静态托管、开发服务器）落到这里，由客户端跳到房间页。

import { Navigate, useParams } from 'react-router';

const ROOM_CODE_PATTERN = /^[A-Za-z0-9]{6}$/;

/** 邀请链接要跳去的页面；房间码格式不对回大厅 */
export function inviteTarget(code: string | undefined): string {
  return code !== undefined && ROOM_CODE_PATTERN.test(code)
    ? `/room/${code.toUpperCase()}`
    : '/lobby';
}

export default function Invite() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={inviteTarget(code)} replace />;
}
