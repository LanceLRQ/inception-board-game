// 复制文本：优先用异步剪贴板接口；不可用或被拒绝时，选中指定输入框后走 execCommand；都不行就只留下选中状态

/** clipboard：写入成功；selected：没能写入，但文本已选中，用户可手动复制；failed：连选中都做不到 */
export type CopyOutcome = 'clipboard' | 'selected' | 'failed';

export async function copyText(
  text: string,
  fallbackInput?: HTMLInputElement | HTMLTextAreaElement | null,
): Promise<CopyOutcome> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    }
  } catch {
    /* 权限被拒、非安全上下文等：走回落 */
  }
  if (!fallbackInput) return 'failed';
  try {
    fallbackInput.focus();
    fallbackInput.select();
    fallbackInput.setSelectionRange(0, text.length);
    if (typeof document.execCommand === 'function' && document.execCommand('copy')) {
      return 'clipboard';
    }
    return 'selected';
  } catch {
    return 'failed';
  }
}
