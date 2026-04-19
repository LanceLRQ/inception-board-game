import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  COPYRIGHT,
  COPYRIGHT_ACK_KEY,
  getShortCopyrightLine,
  getTutorialCopyrightText,
  hasAcknowledgedCopyright,
  acknowledgeCopyright,
} from './copyright';

describe('COPYRIGHT constants', () => {
  it('has publisher in Chinese', () => {
    expect(COPYRIGHT.originalPublisher).toBe('广州千骐动漫有限公司');
  });

  it('has publisher website', () => {
    expect(COPYRIGHT.originalPublisherWebsite).toBe('www.cncgcg.com');
  });

  it('ACK storage key is stable', () => {
    expect(COPYRIGHT_ACK_KEY).toBe('icgame-copyright-ack');
  });
});

describe('getShortCopyrightLine', () => {
  it('includes publisher name', () => {
    expect(getShortCopyrightLine()).toContain(COPYRIGHT.originalPublisher);
  });

  it('mentions MIT license nature', () => {
    expect(getShortCopyrightLine()).toContain('MIT');
  });
});

describe('getTutorialCopyrightText', () => {
  const text = getTutorialCopyrightText();

  it('mentions project name', () => {
    expect(text).toContain(COPYRIGHT.projectName);
  });

  it('mentions original publisher', () => {
    expect(text).toContain(COPYRIGHT.originalPublisher);
  });

  it('mentions MIT license for code', () => {
    expect(text).toContain('MIT');
  });

  it('mentions non-commercial usage', () => {
    expect(text).toContain('非商业');
  });
});

describe('acknowledgement storage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    });
  });

  it('hasAcknowledgedCopyright is false initially', () => {
    expect(hasAcknowledgedCopyright()).toBe(false);
  });

  it('hasAcknowledgedCopyright is true after acknowledge', () => {
    acknowledgeCopyright();
    expect(hasAcknowledgedCopyright()).toBe(true);
  });

  it('acknowledge persists the flag = "1"', () => {
    acknowledgeCopyright();
    expect(store.get(COPYRIGHT_ACK_KEY)).toBe('1');
  });
});
