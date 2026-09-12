"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { ALPHABET } from "@/utils/alphabet";

interface AlphabetScrollerProps {
  availableLetters: Set<string>;
  activeLetter?: string | null;
  onSelectLetter: (letter: string) => void;
}

export function AlphabetScroller({
  availableLetters,
  activeLetter,
  onSelectLetter,
}: AlphabetScrollerProps) {
  const [scrubbingLetter, setScrubbingLetter] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getLetterFromClientY = useCallback(
    (clientY: number): string | null => {
      if (!railRef.current) return null;
      const rect = railRef.current.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const clampedPercent = Math.max(0, Math.min(1, relativeY / rect.height));
      const index = Math.floor(clampedPercent * ALPHABET.length);
      const safeIndex = Math.min(index, ALPHABET.length - 1);
      return ALPHABET[safeIndex] || null;
    },
    []
  );

  const handlePointerAction = useCallback(
    (clientY: number) => {
      const letter = getLetterFromClientY(clientY);
      if (letter && availableLetters.has(letter)) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setScrubbingLetter(letter);
        onSelectLetter(letter);
      }
    },
    [getLetterFromClientY, availableLetters, onSelectLetter]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointerAction(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0) {
      handlePointerAction(e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }
    timeoutRef.current = setTimeout(() => {
      setScrubbingLetter(null);
    }, 350);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const displayLetter = scrubbingLetter || activeLetter;

  return (
    <div className="fixed right-1 md:right-2.5 top-1/2 -translate-y-1/2 z-30 flex items-center select-none pointer-events-auto">
      {/* Floating Magnifier Bubble when scrubbing / selecting */}
      {scrubbingLetter && (
        <div className="absolute right-12 flex items-center justify-center w-14 h-14 rounded-2xl bg-surface/95 border-2 border-primary text-primary text-2xl font-black shadow-2xl shadow-primary/20 backdrop-blur-md pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-75">
          <span>{scrubbingLetter}</span>
        </div>
      )}

      {/* Vertical Alphabet Rail */}
      <div
        ref={railRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="flex flex-col items-center py-1.5 px-0.5 md:px-1 bg-black/60 hover:bg-black/85 backdrop-blur-md rounded-full border border-white/10 touch-none shadow-xl transition-all"
        title="Quick jump by letter (A-Z)"
      >
        {ALPHABET.map((char) => {
          const isAvailable = availableLetters.has(char);
          const isSelected = displayLetter === char;

          return (
            <button
              key={char}
              type="button"
              tabIndex={-1}
              disabled={!isAvailable}
              onClick={() => {
                if (isAvailable) {
                  onSelectLetter(char);
                }
              }}
              className={`w-3.5 h-3 md:w-4 md:h-3.5 text-[8px] md:text-[9.5px] leading-none font-mono font-bold flex items-center justify-center transition-all ${
                isSelected
                  ? "text-primary scale-125 font-black drop-shadow-[0_0_6px_rgba(0,255,255,0.8)]"
                  : isAvailable
                  ? "text-textSecondary/80 hover:text-white hover:scale-110"
                  : "text-white/10 pointer-events-none"
              }`}
            >
              {char}
            </button>
          );
        })}
      </div>
    </div>
  );
}
