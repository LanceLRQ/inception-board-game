import { describe, it, expect } from 'vitest';
import {
  isValidCardId,
  deriveTargetPath,
  assignTier,
  toWebpSourcePath,
  entryToUrl,
  sortEntries,
  computeManifestDiff,
  hasChanges,
  dedupeCards,
  extractCardsFromJson,
} from './assetPipeline.js';

describe('isValidCardId', () => {
  it('accepts lowercase alphanumeric + underscore', () => {
    expect(isValidCardId('thief_space_queen')).toBe(true);
    expect(isValidCardId('action_shoot_1')).toBe(true);
    expect(isValidCardId('x')).toBe(true);
  });

  it('rejects uppercase / CJK / punctuation / too-long ids', () => {
    expect(isValidCardId('Thief_Space')).toBe(false);
    expect(isValidCardId('thief-space')).toBe(false);
    expect(isValidCardId('盗梦都市')).toBe(false);
    expect(isValidCardId('')).toBe(false);
    expect(isValidCardId('a'.repeat(61))).toBe(false);
  });
});

describe('deriveTargetPath', () => {
  it('composes {category}/{id}.webp', () => {
    expect(deriveTargetPath('thief_space_queen', 'thief')).toBe('thief/thief_space_queen.webp');
    expect(deriveTargetPath('dm_fortress', 'dream-master')).toBe('dream-master/dm_fortress.webp');
    expect(deriveTargetPath('action_shoot', 'action')).toBe('action/action_shoot.webp');
  });
});

describe('assignTier', () => {
  it('assigns critical to *_back ids', () => {
    expect(assignTier('thief_back', 'thief')).toBe('critical');
    expect(assignTier('dream_master_back', 'dream-master')).toBe('critical');
  });

  it('assigns critical to *_marker ids', () => {
    expect(assignTier('dice_marker', 'other')).toBe('critical');
  });

  it('assigns idle to other category when not critical', () => {
    expect(assignTier('other_config_table', 'other')).toBe('idle');
  });

  it('assigns match-entry to regular characters and cards', () => {
    expect(assignTier('thief_space_queen', 'thief')).toBe('match-entry');
    expect(assignTier('action_shoot', 'action')).toBe('match-entry');
    expect(assignTier('nightmare_hunger_bite', 'nightmare')).toBe('match-entry');
  });
});

describe('toWebpSourcePath', () => {
  it('replaces .jpg with .webp', () => {
    expect(toWebpSourcePath('cards/thief/foo.jpg')).toBe('cards/thief/foo.webp');
    expect(toWebpSourcePath('cards/action/bar.jpeg')).toBe('cards/action/bar.webp');
    expect(toWebpSourcePath('cards/bribe/baz.png')).toBe('cards/bribe/baz.webp');
  });

  it('is idempotent for already-webp paths', () => {
    expect(toWebpSourcePath('cards/thief/foo.webp')).toBe('cards/thief/foo.webp');
  });

  it('is case-insensitive for original extension', () => {
    expect(toWebpSourcePath('cards/thief/foo.JPG')).toBe('cards/thief/foo.webp');
  });
});

describe('entryToUrl', () => {
  it('prefixes with /cards/', () => {
    expect(entryToUrl({ id: 'thief_space_queen', category: 'thief' })).toBe(
      '/cards/thief/thief_space_queen.webp',
    );
  });
});

describe('sortEntries', () => {
  it('sorts by url ascending (stable)', () => {
    const input = [{ url: '/cards/z' }, { url: '/cards/a' }, { url: '/cards/m' }];
    expect(sortEntries(input).map((e) => e.url)).toEqual(['/cards/a', '/cards/m', '/cards/z']);
  });

  it('does not mutate input', () => {
    const input = [{ url: '/cards/z' }, { url: '/cards/a' }];
    sortEntries(input);
    expect(input.map((e) => e.url)).toEqual(['/cards/z', '/cards/a']);
  });
});

describe('computeManifestDiff', () => {
  it('reports added entries', () => {
    const d = computeManifestDiff(
      [{ url: '/a', sha256: '1' }],
      [
        { url: '/a', sha256: '1' },
        { url: '/b', sha256: '2' },
      ],
    );
    expect(d.added).toEqual(['/b']);
    expect(d.updated).toEqual([]);
    expect(d.unchanged).toEqual(['/a']);
  });

  it('reports updated entries (same url, different sha)', () => {
    const d = computeManifestDiff([{ url: '/a', sha256: '1' }], [{ url: '/a', sha256: '2' }]);
    expect(d.updated).toEqual(['/a']);
  });

  it('reports orphans (in current, not in next)', () => {
    const d = computeManifestDiff(
      [
        { url: '/a', sha256: '1' },
        { url: '/b', sha256: '2' },
      ],
      [{ url: '/a', sha256: '1' }],
    );
    expect(d.orphan).toEqual(['/b']);
  });

  it('sorts output lists', () => {
    const d = computeManifestDiff(
      [],
      [
        { url: '/z', sha256: '3' },
        { url: '/a', sha256: '1' },
        { url: '/m', sha256: '2' },
      ],
    );
    expect(d.added).toEqual(['/a', '/m', '/z']);
  });
});

describe('hasChanges', () => {
  it('is false when no adds/updates/orphans', () => {
    expect(
      hasChanges({
        added: [],
        updated: [],
        orphan: [],
        missing: [],
        unchanged: ['/x'],
      }),
    ).toBe(false);
  });

  it('is true if any bucket has entries', () => {
    expect(
      hasChanges({
        added: ['/a'],
        updated: [],
        orphan: [],
        missing: [],
        unchanged: [],
      }),
    ).toBe(true);
    expect(
      hasChanges({
        added: [],
        updated: ['/a'],
        orphan: [],
        missing: [],
        unchanged: [],
      }),
    ).toBe(true);
    expect(
      hasChanges({
        added: [],
        updated: [],
        orphan: ['/a'],
        missing: [],
        unchanged: [],
      }),
    ).toBe(true);
  });
});

describe('dedupeCards', () => {
  it('preserves order and removes duplicates', () => {
    const out = dedupeCards([
      { id: 'a', category: 'thief', image: 'a.jpg' },
      { id: 'b', category: 'thief', image: 'b.jpg' },
      { id: 'a', category: 'thief', image: 'a-dup.jpg' },
    ]);
    expect(out.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('drops invalid ids silently', () => {
    const out = dedupeCards([
      { id: 'valid_id', category: 'thief', image: 'a.jpg' },
      { id: 'Invalid-Id', category: 'thief', image: 'b.jpg' },
      { id: '', category: 'thief', image: 'c.jpg' },
    ]);
    expect(out.map((c) => c.id)).toEqual(['valid_id']);
  });
});

describe('extractCardsFromJson', () => {
  it('flattens nested cards object into flat list with correct categories', () => {
    const out = extractCardsFromJson({
      cards: {
        thief: [
          {
            id: 'thief_one',
            sides: [{ side: 'front', image: 'cards/thief/a.jpg' }],
          },
        ],
        dreamMaster: [
          {
            id: 'dm_one',
            sides: [{ side: 'front', image: 'cards/dream-master/b.jpg' }],
          },
        ],
        action: [
          {
            id: 'action_one',
            image: 'cards/action/c.jpg', // 无 sides，直接用 image 字段
          },
        ],
      },
    });
    expect(out.length).toBe(3);
    const thief = out.find((c) => c.category === 'thief');
    const dm = out.find((c) => c.category === 'dream-master');
    const act = out.find((c) => c.category === 'action');
    expect(thief?.id).toBe('thief_one');
    expect(dm?.id).toBe('dm_one');
    expect(act?.image).toBe('cards/action/c.jpg');
  });

  it('ignores unknown categories silently', () => {
    const out = extractCardsFromJson({
      cards: { madeUpCategory: [{ id: 'x', image: 'x.jpg' }] },
    });
    expect(out).toEqual([]);
  });

  it('ignores cards without id', () => {
    const out = extractCardsFromJson({
      cards: { thief: [{ image: 'no-id.jpg' }] },
    });
    expect(out).toEqual([]);
  });

  it('ignores cards without image info', () => {
    const out = extractCardsFromJson({
      cards: { thief: [{ id: 'no_image' }] },
    });
    expect(out).toEqual([]);
  });
});
