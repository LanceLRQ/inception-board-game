// 首屏主题脚本：在页面绘制之前同步设置主题属性，避免先闪一下默认主题
//
// 返回的源码自包含、不依赖任何模块；主题表由 THEMES 生成。
// 由 vite.config.ts 的内联插件注入到 <head> 最前面。

import { DEFAULT_THEME_ID, THEMES, THEME_IDS, THEME_STORAGE_KEY } from './themes';

export function buildThemeBootScript(): string {
  const table: Record<string, { scheme: string; color: string; bg: string }> = {};
  for (const id of THEME_IDS) {
    table[id] = {
      scheme: THEMES[id].scheme,
      color: THEMES[id].themeColor,
      bg: THEMES[id].tokens.bg,
    };
  }
  // 防止主题表里出现 </script> 之类的字符把内联脚本截断
  const tableJson = JSON.stringify(table).replace(/</g, '\\u003c');
  return (
    '(function(){' +
    `var T=${tableJson};` +
    `var id=${JSON.stringify(DEFAULT_THEME_ID)};` +
    `try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    'if(s&&Object.prototype.hasOwnProperty.call(T,s))id=s;}catch(e){}' +
    'var t=T[id];var r=document.documentElement;' +
    "r.setAttribute('data-theme',id);" +
    "r.setAttribute('data-scheme',t.scheme);" +
    // 样式表到位之前（开发服务器按模块注入样式、样式被拦截时）也先把底色与控件配色定下来，
    // 亮色主题刷新时不闪一下深色（或默认的白底）
    'if(r.style){r.style.backgroundColor=t.bg;r.style.colorScheme=t.scheme;}' +
    'var m=document.querySelector(\'meta[name="theme-color"]\');' +
    "if(m)m.setAttribute('content',t.color);" +
    '})();'
  );
}
