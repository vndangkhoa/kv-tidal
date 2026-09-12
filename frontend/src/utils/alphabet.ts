// Alphabet Indexing and Normalization Utilities for Fast Scroller

export const ALPHABET = [
  "#",
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
];

/**
 * Extracts the single uppercase sorting character ('#' or 'A'-'Z') for a string.
 * Handles Vietnamese diacritics (e.g., 'Đ' -> 'D', 'Ơ' -> 'O', 'Ư' -> 'U')
 * and numbers/symbols (mapped to '#').
 */
export function getSortLetter(str: string | null | undefined): string {
  if (!str) return "#";
  const trimmed = str.trim();
  if (!trimmed) return "#";

  // Normalize Unicode diacritics and map Vietnamese specific characters
  const normalized = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, (m) => (m === "đ" ? "d" : "D"));

  const firstChar = normalized.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(firstChar) ? firstChar : "#";
}

export interface LetterMapResult {
  availableLetters: Set<string>;
  letterIndexMap: Record<string, number>;
}

/**
 * Precomputes the first index of each letter within a sorted list of names.
 */
export function buildLetterIndexMap(names: string[]): LetterMapResult {
  const availableLetters = new Set<string>();
  const letterIndexMap: Record<string, number> = {};

  names.forEach((name, index) => {
    const letter = getSortLetter(name);
    availableLetters.add(letter);
    if (letterIndexMap[letter] === undefined) {
      letterIndexMap[letter] = index;
    }
  });

  return { availableLetters, letterIndexMap };
}
