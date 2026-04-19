import { describe, it, expect } from 'vitest';
import {
  validateAllCards,
  getCardById,
  getAllCharacters,
  getCardsByCategory,
} from '../cards/abilityRegistry.js';
import type { ActionCardDefinition } from '../types/cards.js';

describe('abilityRegistry', () => {
  it('should have no validation errors', () => {
    const errors = validateAllCards();
    expect(errors).toEqual([]);
  });

  it('should retrieve thief characters', () => {
    const chars = getAllCharacters();
    expect(chars.length).toBeGreaterThan(0);
    const thief = chars.find((c) => c.id === 'thief_space_queen');
    expect(thief).toBeDefined();
    expect(thief!.faction).toBe('thief');
  });

  it('should retrieve card by id', () => {
    const card = getCardById('thief_space_queen');
    expect(card).toBeDefined();
    expect(card!.id).toBe('thief_space_queen');
  });

  it('should retrieve action cards by category', () => {
    const actions = getCardsByCategory<ActionCardDefinition>('action');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]!.category).toBe('action');
  });

  it('should return undefined for unknown card', () => {
    const card = getCardById('nonexistent_card');
    expect(card).toBeUndefined();
  });
});
