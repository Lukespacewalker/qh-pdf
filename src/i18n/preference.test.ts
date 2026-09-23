import { describe, expect, it, vi } from 'vitest';
import { languagePreferenceKey, readLanguagePreference, writeLanguagePreference } from './preference';

function storageWith(value: string | null): Storage {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: value === null ? 0 : 1,
  };
}

describe('language preference', () => {
  it.each([
    ['th', 'th'],
    ['en', 'en'],
    ['fr', 'en'],
    [null, 'en'],
  ] as const)('reads %j as %s', (stored, expected) => {
    expect(readLanguagePreference(storageWith(stored))).toBe(expected);
  });

  it('falls back to English when browser storage cannot be read', () => {
    const storage = storageWith(null);
    vi.mocked(storage.getItem).mockImplementation(() => { throw new Error('blocked'); });
    expect(readLanguagePreference(storage)).toBe('en');
  });

  it('stores only the language preference and tolerates write failures', () => {
    const storage = storageWith(null);
    writeLanguagePreference('th', storage);
    expect(storage.setItem).toHaveBeenCalledWith(languagePreferenceKey, 'th');

    vi.mocked(storage.setItem).mockImplementation(() => { throw new Error('full'); });
    expect(() => writeLanguagePreference('en', storage)).not.toThrow();
  });
});
