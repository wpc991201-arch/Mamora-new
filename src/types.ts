export interface Card {
  id: string;
  word: string;
  translation: string;
  pos: string;
  example: string;
  exampleTranslation: string;
  status: 'learning' | 'forgotten' | 'remembered';
  nextReviewDate: string; // ISO date string YYYY-MM-DD
  intervalDays: number;   // Spaced repetition interval (e.g., 1, 2, 4, 7, 15, 30)
  history: {
    date: string; // YYYY-MM-DD
    status: 'forgotten' | 'remembered';
  }[];
}

export interface WordDetail {
  word: string;
  phonetic: string;
  variations: { pos: string; word: string; meaning: string }[];
  synonyms: { word: string; meaning: string }[];
  usageNotes: string;
  examples: { sentence: string; translation: string }[];
  wordRoots: { prefix: string; root: string; suffix: string; breakdown: string };
  relatedWords: string[];
}

export interface FlashcardSet {
  id: string;
  title: string;
  icon: string; // Emoji
  cards: Card[];
  createdAt: string;
  tags?: string[]; // Tag classifications like "TOEIC", "IELTS", "Business", etc.
  // NotebookLM integration fields
  sourceText?: string;
  sourceType?: 'text' | 'image' | 'url';
  sourceUrl?: string;
  studyGuideSummary?: string;
  studyGuideGrammar?: string[];
  studyGuideExamSkills?: string[];
  studyGuideFaqs?: { question: string; answer: string }[];
  chatMessages?: { id: string; sender: 'user' | 'ai'; text: string; timestamp: string }[];
  wordDetails?: { [word: string]: WordDetail };
}

export interface DailyProgress {
  date: string; // YYYY-MM-DD
  remembered: number;
  forgotten: number;
}

export interface DetailedAIExplanation {
  phonetic: string;
  usages: string[];
  variations: {
    pos: string;
    word: string;
    meaning: string;
  }[];
  synonyms: {
    word: string;
    meaning: string;
  }[];
  detailedExplanation: string;
}

export interface EvaluatedBadge {
  id: string;
  name: string;
  icon: string;
  category: string;
  requirementValue: number;
  requirementText: string;
  description: string;
  isUnlocked: boolean;
  currentValue: number;
}

