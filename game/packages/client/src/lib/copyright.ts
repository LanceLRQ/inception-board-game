// 版权元信息常量 - 四重展示点共享
// 对照：NOTICE 根文件 / plans/design/06-frontend-design.md 版权展示

export const COPYRIGHT_ACK_KEY = 'icgame-copyright-ack';

export const COPYRIGHT = {
  /** 项目自身 */
  projectName: '盗梦都市 · Inception City Online',
  projectCopyright: '© 2026 LanceLRQ and contributors',
  projectLicense: 'MIT License',
  /** 原版桌游 */
  originalGameTitle: '《盗梦都市》',
  originalGameTitleEn: 'Inception City',
  originalPublisher: '广州千骐动漫有限公司',
  originalPublisherEn: 'Guangzhou Qianqi Animation Co., Ltd.',
  originalPublisherWebsite: 'www.cncgcg.com',
  /** 使用性质 */
  usageNote: '本项目仅作爱好者复刻用途，非商业化使用。',
  usageNoteEn: 'A non-commercial fan project.',
  /** 下架联系 */
  takedownHint: '如原发行商认为存在侵权，请通过 GitHub Issue 联系维护者。',
} as const;

/** 简短一行版权声明（Footer / Landing 底部使用） */
export function getShortCopyrightLine(): string {
  return `原版《盗梦都市》版权归${COPYRIGHT.originalPublisher}所有 · 本项目 MIT，代码与素材采用双重协议。`;
}

/** 教学前展示的完整声明（modal 版，markdown-lite） */
export function getTutorialCopyrightText(): string {
  return [
    `欢迎来到 ${COPYRIGHT.projectName}！`,
    '',
    `本项目是爱好者基于原版桌游 ${COPYRIGHT.originalGameTitle} 复刻的开源项目。`,
    `原作版权归 ${COPYRIGHT.originalPublisher}（${COPYRIGHT.originalPublisherWebsite}）所有。`,
    '',
    `• 代码：MIT License（${COPYRIGHT.projectCopyright}）`,
    `• 素材：保留所有权利，爱好者 Fair Use 范畴内使用`,
    `• ${COPYRIGHT.usageNote}`,
    '',
    '继续教程即视为你已阅读并同意上述声明。',
  ].join('\n');
}

export function hasAcknowledgedCopyright(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(COPYRIGHT_ACK_KEY) === '1';
}

export function acknowledgeCopyright(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(COPYRIGHT_ACK_KEY, '1');
  } catch {
    // 忽略
  }
}
