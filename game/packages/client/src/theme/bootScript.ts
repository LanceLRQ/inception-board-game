// 首屏主题脚本：在页面绘制之前同步设置主题属性，避免先闪一下默认主题
//
// 返回的源码自包含、不依赖任何模块；主题表由 THEMES 生成。
// 由 vite.config.ts 的内联插件注入到 <head> 最前面。

import { EFFECTS, EFFECTS_STORAGE_KEY, EFFECT_KEYS, MOTION_PREFS } from './effects';
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
  // 效果偏好：开关键 → 关闭时写进 data-fx-off 的内部名字（顺序与 fxOffAttribute 一致）
  const fx: Record<string, readonly string[]> = {};
  for (const e of EFFECTS) fx[e.key] = e.fxNames;
  const fxJson = JSON.stringify(fx).replace(/</g, '\\u003c');
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
    // 效果偏好也在首屏写好，刷新后不会先播一帧动画再停；读不到或内容无效就什么都不写
    `try{var e=JSON.parse(localStorage.getItem(${JSON.stringify(EFFECTS_STORAGE_KEY)}));` +
    "if(e&&typeof e==='object'&&!Array.isArray(e)){" +
    `var F=${fxJson},K=${JSON.stringify(EFFECT_KEYS)},o=Array.isArray(e.off)?e.off:[],n=[];` +
    'for(var i=0;i<K.length;i++){if(o.indexOf(K[i])>=0)n=n.concat(F[K[i]]);}' +
    "if(n.length)r.setAttribute('data-fx-off',n.join(' '));" +
    `if(e.motion===${JSON.stringify(MOTION_PREFS[1])})r.setAttribute('data-motion','reduced');` +
    `else if(e.motion===${JSON.stringify(MOTION_PREFS[2])})r.setAttribute('data-motion','full');` +
    '}}catch(x){}' +
    '})();'
  );
}
