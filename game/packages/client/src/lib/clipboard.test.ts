import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

function fakeInput() {
  return {
    focus: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
  } as unknown as HTMLInputElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('剪贴板接口可用时直接写入', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyText('hello')).resolves.toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('剪贴板被拒绝且没有回落输入框：失败', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    });
    await expect(copyText('hello')).resolves.toBe('failed');
  });

  it('剪贴板被拒绝：选中回落输入框并尝试 execCommand', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal('document', { execCommand });
    const input = fakeInput();
    await expect(copyText('hello', input)).resolves.toBe('clipboard');
    expect(input.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('execCommand 也不行时只留下选中状态', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', { execCommand: vi.fn().mockReturnValue(false) });
    const input = fakeInput();
    await expect(copyText('hello', input)).resolves.toBe('selected');
    expect(input.select).toHaveBeenCalled();
  });

  it('选中本身抛错时失败', async () => {
    vi.stubGlobal('navigator', {});
    const input = {
      focus: vi.fn(),
      select: vi.fn(() => {
        throw new Error('x');
      }),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLInputElement;
    await expect(copyText('hello', input)).resolves.toBe('failed');
  });
});
