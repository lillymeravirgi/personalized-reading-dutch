import { create } from "zustand";
import type {
  User,
  VocabularyWord,
  WordStatus,
  ReadingSession,
  WordInteraction,
  FlashcardItem,
} from "../types";

// ── User slice ────────────────────────────────────────────────────────────────

interface UserSlice {
  user: User | null;
  isLoadingUser: boolean;
  setUser: (user: User) => void;
  setLoadingUser: (loading: boolean) => void;
  clearUser: () => void;
}

// ── Vocabulary slice ──────────────────────────────────────────────────────────

interface VocabularySlice {
  vocabulary: VocabularyWord[];
  setVocabulary: (words: VocabularyWord[]) => void;
  updateWordStatus: (wordId: string, status: WordStatus) => void;
  incrementExposure: (wordId: string) => void;
}

// ── Session slice ─────────────────────────────────────────────────────────────

interface SessionSlice {
  currentSession: ReadingSession | null;
  interactions: WordInteraction[];
  isLoadingSession: boolean;
  setCurrentSession: (session: ReadingSession) => void;
  setLoadingSession: (loading: boolean) => void;
  addInteraction: (interaction: WordInteraction) => void;
  clearSession: () => void;
}

// ── Flashcard slice ───────────────────────────────────────────────────────────

interface FlashcardSlice {
  flashcards: FlashcardItem[];
  currentIndex: number;
  reviewedIds: Set<string>;
  isLoadingFlashcards: boolean;
  setFlashcards: (cards: FlashcardItem[]) => void;
  setLoadingFlashcards: (loading: boolean) => void;
  nextCard: () => void;
  prevCard: () => void;
  markReviewed: (wordId: string) => void;
  resetSession: () => void;
}

// ── Combined store type ───────────────────────────────────────────────────────

type Store = UserSlice & VocabularySlice & SessionSlice & FlashcardSlice;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useStore = create<Store>((set, get) => ({
  // ── User ──────────────────────────────────────────────────────────────────
  user: null,
  isLoadingUser: false,

  setUser: (user) => set({ user }),
  setLoadingUser: (loading) => set({ isLoadingUser: loading }),
  clearUser: () => set({ user: null }),

  // ── Vocabulary ────────────────────────────────────────────────────────────
  vocabulary: [],

  setVocabulary: (vocabulary) => set({ vocabulary }),

  updateWordStatus: (wordId, status) =>
    set((state) => ({
      vocabulary: state.vocabulary.map((w) =>
        w.wordId === wordId ? { ...w, status } : w
      ),
    })),

  incrementExposure: (wordId) =>
    set((state) => ({
      vocabulary: state.vocabulary.map((w) =>
        w.wordId === wordId
          ? {
              ...w,
              exposureCount: w.exposureCount + 1,
              lastSeen: new Date().toISOString(),
            }
          : w
      ),
    })),

  // ── Session ───────────────────────────────────────────────────────────────
  currentSession: null,
  interactions: [],
  isLoadingSession: false,

  setCurrentSession: (session) => set({ currentSession: session }),
  setLoadingSession: (loading) => set({ isLoadingSession: loading }),

  addInteraction: (interaction) =>
    set((state) => ({
      interactions: [...state.interactions, interaction],
    })),

  clearSession: () =>
    set({ currentSession: null, interactions: [] }),

  // ── Flashcards ────────────────────────────────────────────────────────────
  flashcards: [],
  currentIndex: 0,
  reviewedIds: new Set(),
  isLoadingFlashcards: false,

  setFlashcards: (flashcards) => set({ flashcards, currentIndex: 0, reviewedIds: new Set() }),
  setLoadingFlashcards: (loading) => set({ isLoadingFlashcards: loading }),

  nextCard: () =>
    set((state) => ({
      currentIndex: Math.min(state.currentIndex + 1, state.flashcards.length - 1),
    })),

  prevCard: () =>
    set((state) => ({
      currentIndex: Math.max(state.currentIndex - 1, 0),
    })),

  markReviewed: (wordId) =>
    set((state) => {
      const next = new Set(state.reviewedIds);
      next.add(wordId);
      // Auto-advance to next unreviewed card
      const nextIndex = state.flashcards.findIndex(
        (c, i) => i > state.currentIndex && !next.has(c.wordId)
      );
      return {
        reviewedIds: next,
        currentIndex: nextIndex !== -1 ? nextIndex : state.currentIndex,
      };
    }),

  resetSession: () =>
    set((state) => ({
      currentIndex: 0,
      reviewedIds: new Set(),
      // Re-queue learning-mode cards that haven't been reviewed
      flashcards: [
        ...state.flashcards.filter((c) => !state.reviewedIds.has(c.wordId)),
        ...state.flashcards.filter((c) => state.reviewedIds.has(c.wordId)),
      ],
    })),
}));

// ── Typed selector hooks ──────────────────────────────────────────────────────
// Convenience hooks so components don't import the whole store type.

export const useUser = () => useStore((s) => s.user);
export const useVocabulary = () => useStore((s) => s.vocabulary);
export const useCurrentSession = () => useStore((s) => s.currentSession);
export const useFlashcards = () => useStore((s) => s.flashcards);
export const useCurrentCard = () =>
  useStore((s) => s.flashcards[s.currentIndex] ?? null);
export const useReviewProgress = () =>
  useStore((s) => ({
    reviewed: s.reviewedIds.size,
    total: s.flashcards.length,
    percent:
      s.flashcards.length > 0
        ? Math.round((s.reviewedIds.size / s.flashcards.length) * 100)
        : 0,
  }));
