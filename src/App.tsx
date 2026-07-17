import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FlashcardSet, Card, DailyProgress } from "./types";
import { DEFAULT_SETS } from "./utils/seedData";
import HomeView from "./components/HomeView";
import ReviewSession from "./components/ReviewSession";
import NotebookWorkspace from "./components/NotebookWorkspace";
import QuizWorkspace from "./components/QuizWorkspace";
import { speak } from "./utils/tts";
import { 
  Sparkles, Brain, BookOpen, Star, Layers, HelpCircle, GraduationCap,
  Settings, Award, Trash2, Check, Plus, X, ChevronRight, RefreshCw, Trophy
} from "lucide-react";

// Google Account Binding & Sheets Sync imports
import { User } from "firebase/auth";
import { initAuth, googleSignIn, logout as googleLogout } from "./utils/auth";
import { findOrCreateSpreadsheet, syncSetsToSpreadsheet } from "./utils/googleSheets";

// Creative Badge definitions
const BADGES = [
  {
    id: "rem-1",
    name: "單字小萌芽",
    category: "remembered",
    requirementText: "記住 50 個單字",
    requirementValue: 50,
    description: "萬丈高樓平地起，你已踏出字彙積累的第一步！",
    icon: "🌱"
  },
  {
    id: "rem-2",
    name: "字庫小富翁",
    category: "remembered",
    requirementText: "記住 150 個單字",
    requirementValue: 150,
    description: "字庫開始充實，對英文閱讀開始有了底氣！",
    icon: "💰"
  },
  {
    id: "rem-3",
    name: "詞彙探險家",
    category: "remembered",
    requirementText: "記住 300 個單字",
    requirementValue: 300,
    description: "在浩瀚的詞海中探索，你已經是一名合格的詞彙獵人！",
    icon: "🧭"
  },
  {
    id: "rem-4",
    name: "記憶大師",
    category: "remembered",
    requirementText: "記住 500 個單字",
    requirementValue: 500,
    description: "超凡的記憶力！500 個字彙已深深刻入你的大腦中！",
    icon: "🧙‍♂️"
  },
  {
    id: "rem-5",
    name: "詞海大宗師",
    category: "remembered",
    requirementText: "記住 1000 個單字",
    requirementValue: 1000,
    description: "神乎其技的字量！英文對你而言不再是天書！",
    icon: "👑"
  },
  {
    id: "rem-6",
    name: "辭海巨擘",
    category: "remembered",
    requirementText: "記住 1500 個單字",
    requirementValue: 1500,
    description: "擁有 1500 個記住的單字，你的字彙量已與母語人士比肩！",
    icon: "🌋"
  },
  {
    id: "rem-7",
    name: "記憶終結真神",
    category: "remembered",
    requirementText: "記住 2000 個單字",
    requirementValue: 2000,
    description: "記住 2000 個單字！你已經超越了單字卡的範疇，是行走的活字典！",
    icon: "🌌"
  },

  {
    id: "fr-1",
    name: "不屈戰士",
    category: "forgotten_remembered",
    requirementText: "成功救回 30 個遺忘單字",
    requirementValue: 30,
    description: "忘記並不可怕，可怕的是放棄！你成功戰勝了遺忘！",
    icon: "🛡️"
  },
  {
    id: "fr-2",
    name: "鳳凰涅槃",
    category: "forgotten_remembered",
    requirementText: "成功救回 100 個遺忘單字",
    requirementValue: 100,
    description: "從遺忘的深淵中重生，在複習中百煉成鋼！",
    icon: "🔥"
  },
  {
    id: "fr-3",
    name: "逆風翻盤",
    category: "forgotten_remembered",
    requirementText: "成功救回 250 個遺忘單字",
    requirementValue: 250,
    description: "以驚人的毅力對抗記憶衰退，這就是複習的魅力！",
    icon: "🪁"
  },
  {
    id: "fr-4",
    name: "百折不撓",
    category: "forgotten_remembered",
    requirementText: "成功救回 500 個遺忘單字",
    requirementValue: 500,
    description: "遺忘曲線的終結者！不屈不撓的精神讓人動容！",
    icon: "⚓"
  },
  {
    id: "fr-5",
    name: "遺忘終結之神",
    category: "forgotten_remembered",
    requirementText: "成功救回 750 個遺忘單字",
    requirementValue: 750,
    description: "成功救回 750 個遺忘單字！強大的神經元重新連接，任何單字都逃不過你的掌心！",
    icon: "⚡"
  },
  {
    id: "fr-6",
    name: "永恆記憶聖者",
    category: "forgotten_remembered",
    requirementText: "成功救回 1000 個遺忘單字",
    requirementValue: 1000,
    description: "成功救回 1000 個遺忘單字！你將「間隔重複法」發揮到了極致，是當之無愧的複習宗師！",
    icon: "🪐"
  },

  {
    id: "qp-1",
    name: "初露鋒芒",
    category: "perfect_quiz",
    requirementText: "獲得 10 次測驗滿分 (100分)",
    requirementValue: 10,
    description: "完美無瑕！高超的理解與作答，開啟了你邁向巔峰的旅程！",
    icon: "🎯"
  },
  {
    id: "qp-2",
    name: "滿分收割者",
    category: "perfect_quiz",
    requirementText: "獲得 30 次測驗滿分 (100分)",
    requirementValue: 30,
    description: "滿分對你來說只是日常，你是考場上的無情收割機！",
    icon: "🌾"
  },
  {
    id: "qp-3",
    name: "全能考霸",
    category: "perfect_quiz",
    requirementText: "獲得 50 次測驗滿分 (100分)",
    requirementValue: 50,
    description: "精裝把控每一個細節，考場上無人可動搖你的地位！",
    icon: "🏆"
  },
  {
    id: "qp-4",
    name: "AI 認證學霸",
    category: "perfect_quiz",
    requirementText: "獲得 100 次測驗滿分 (100分)",
    requirementValue: 100,
    description: "連 AI 老師都對你豎起大拇指！你已經超越了凡人！",
    icon: "🎓"
  },
  {
    id: "qp-5",
    name: "考場常勝真神",
    category: "perfect_quiz",
    requirementText: "獲得 150 次測驗滿分 (100分)",
    requirementValue: 150,
    description: "獲得 150 次測驗滿分 (100分)！每一場作答都是一場視覺盛宴，全對已是常態！",
    icon: "🎖️"
  },
  {
    id: "qp-6",
    name: "滿分不朽史詩",
    category: "perfect_quiz",
    requirementText: "獲得 200 次測驗滿分 (100分)",
    requirementValue: 200,
    description: "獲得 200 次測驗滿分 (100分)！用無數個滿分築起不朽的學識長城，你是奇蹟的代名詞！",
    icon: "🌌"
  }
];

function getNextInterval(currentInterval: number, steps: number[]): number {
  const index = steps.indexOf(currentInterval);
  if (index === -1) {
    const nextStep = steps.find(s => s > currentInterval);
    return nextStep || currentInterval * 2;
  }
  if (index + 1 < steps.length) {
    return steps[index + 1];
  }
  return currentInterval * 2;
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export default function App() {
  // Google Sheets & Account Binding States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(() => {
    return localStorage.getItem("google_spreadsheet_id");
  });
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(() => {
    return localStorage.getItem("google_sheets_last_synced");
  });

  // Handle Auth initialization
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        if (token) {
          setGoogleToken(token);
        }
      },
      () => {
        setCurrentUser(null);
        setGoogleToken(null);
      }
    );
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  // 1. Initial State: Load sets
  const [sets, setSets] = useState<FlashcardSet[]>(() => {
    const saved = localStorage.getItem("flashcard_sets");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse sets from localStorage, using default");
      }
    }
    // Save defaults to localStorage initially
    localStorage.setItem("flashcard_sets", JSON.stringify(DEFAULT_SETS));
    return DEFAULT_SETS;
  });

  // 2. Initial State: Load progress history (or generate mock if empty)
  const [dailyProgress, setDailyProgress] = useState<DailyProgress[]>(() => {
    const saved = localStorage.getItem("flashcard_progress");
    const today = new Date();
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // If the user has saved progress but it has fewer entries,
          // let's fill in the rest of the 30 days to make the 1-month chart fully populated and gorgeous!
          if (parsed.length < 25) {
            const existingDates = new Set(parsed.map(p => p.date));
            const mergedList = [...parsed];
            for (let i = 30; i >= 1; i--) {
              const d = new Date();
              d.setDate(today.getDate() - i);
              const dateStr = d.toISOString().split("T")[0];
              if (!existingDates.has(dateStr)) {
                mergedList.push({
                  date: dateStr,
                  remembered: Math.floor(Math.random() * 6) + 4, // 4-10
                  forgotten: Math.floor(Math.random() * 3) + 1, // 1-4
                });
              }
            }
            mergedList.sort((a, b) => a.date.localeCompare(b.date));
            localStorage.setItem("flashcard_progress", JSON.stringify(mergedList));
            return mergedList;
          }
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse progress from localStorage");
      }
    }

    // Generate beautiful realistic past logs for 30 days initially for demo/first-run
    const list: DailyProgress[] = [];
    for (let i = 30; i >= 1; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      list.push({
        date: dateStr,
        remembered: Math.floor(Math.random() * 6) + 4, // 4-10
        forgotten: Math.floor(Math.random() * 3) + 1, // 1-4
      });
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem("flashcard_progress", JSON.stringify(list));
    return list;
  });

  // 3. Spaced repetition: Calculate cards currently due for review
  const [dueCards, setDueCards] = useState<Card[]>([]);

  const calculateDueCards = (currentSets: FlashcardSet[]) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const due: Card[] = [];
    currentSets.forEach(set => {
      set.cards.forEach(card => {
        // A card is due if nextReviewDate <= today's date
        if (card.nextReviewDate <= todayStr) {
          due.push(card);
        }
      });
    });
    setDueCards(due);
  };

  useEffect(() => {
    calculateDueCards(sets);
  }, [sets]);

  // 4. Active Review Session State
  const [activeReviewSession, setActiveReviewSession] = useState<FlashcardSet | null>(null);
  const [reviewType, setReviewType] = useState<"all" | "forgotten">("all");

  // 5. Active NotebookLM Workspace State
  const [activeNotebookWorkspace, setActiveNotebookWorkspace] = useState<FlashcardSet | null>(null);

  // Active Quiz State
  const [activeQuizSet, setActiveQuizSet] = useState<FlashcardSet | null>(null);

  // Synchronize active notebook to the master sets list
  const activeNotebook = activeNotebookWorkspace 
    ? sets.find(s => s.id === activeNotebookWorkspace.id) || activeNotebookWorkspace
    : null;

  // Synchronize active quiz to the master sets list
  const activeQuiz = activeQuizSet
    ? sets.find(s => s.id === activeQuizSet.id) || activeQuizSet
    : null;

  // Custom Spacing steps state (default is [1, 2, 4, 7, 15, 30, 60])
  const [spacingSteps, setSpacingSteps] = useState<number[]>(() => {
    const saved = localStorage.getItem("flashcard_spacing_steps");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(Number).sort((a, b) => a - b);
        }
      } catch (e) {
        console.error("Failed to parse spacing steps, using default");
      }
    }
    return [1, 2, 4, 7, 15, 30, 60];
  });

  // Forgotten Spacing steps state (default is [1, 2, 3, 5])
  const [forgottenSpacingSteps, setForgottenSpacingSteps] = useState<number[]>(() => {
    const saved = localStorage.getItem("flashcard_forgotten_spacing_steps");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(Number).sort((a, b) => a - b);
        }
      } catch (e) {
        console.error("Failed to parse forgotten spacing steps, using default");
      }
    }
    return [1, 2, 3, 5];
  });

  // User Stats state for tracking badges
  const [userStats, setUserStats] = useState(() => {
    const saved = localStorage.getItem("flashcard_user_stats");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse user stats");
      }
    }
    return {
      forgottenRememberedCount: 0,
      quizPerfectCount: 0
    };
  });

  // Synchronize user stats to localStorage
  useEffect(() => {
    localStorage.setItem("flashcard_user_stats", JSON.stringify(userStats));
  }, [userStats]);

  // Synchronize spacing steps to localStorage
  useEffect(() => {
    localStorage.setItem("flashcard_spacing_steps", JSON.stringify(spacingSteps));
  }, [spacingSteps]);

  useEffect(() => {
    localStorage.setItem("flashcard_forgotten_spacing_steps", JSON.stringify(forgottenSpacingSteps));
  }, [forgottenSpacingSteps]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBadgesOpen, setIsBadgesOpen] = useState(false);
  const [newIntervalStep, setNewIntervalStep] = useState("");
  const [newForgottenIntervalStep, setNewForgottenIntervalStep] = useState("");
  const [intervalsError, setIntervalsError] = useState<string | null>(null);
  const [forgottenIntervalsError, setForgottenIntervalsError] = useState<string | null>(null);

  // Categories / Tag management state
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("flashcard_categories");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse categories");
      }
    }
    const defaultCategories = ["多益", "雅思", "商務英語", "生活實用", "學測指考", "托福", "日常會話", "軟體科技"];
    localStorage.setItem("flashcard_categories", JSON.stringify(defaultCategories));
    return defaultCategories;
  });

  const handleAddCategory = (newTag: string) => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) return;
    const updated = [...categories, trimmed];
    setCategories(updated);
    localStorage.setItem("flashcard_categories", JSON.stringify(updated));
  };

  const handleEditCategory = (oldTag: string, newTag: string) => {
    const trimmedNew = newTag.trim();
    if (!trimmedNew || oldTag === trimmedNew) return;
    
    // 1. Update list of categories
    const updatedCategories = categories.map(c => c === oldTag ? trimmedNew : c);
    setCategories(updatedCategories);
    localStorage.setItem("flashcard_categories", JSON.stringify(updatedCategories));

    // 2. Rename the tag in all flashcard sets
    const updatedSets = sets.map(set => {
      if (!set.tags) return set;
      const updatedTags = set.tags.map(t => t === oldTag ? trimmedNew : t);
      return { ...set, tags: updatedTags };
    });
    setSets(updatedSets);
    localStorage.setItem("flashcard_sets", JSON.stringify(updatedSets));
  };

  const handleDeleteCategory = (tagToDelete: string) => {
    // 1. Remove from categories list
    const updatedCategories = categories.filter(c => c !== tagToDelete);
    setCategories(updatedCategories);
    localStorage.setItem("flashcard_categories", JSON.stringify(updatedCategories));

    // 2. Remove tag from all sets
    const updatedSets = sets.map(set => {
      if (!set.tags) return set;
      const updatedTags = set.tags.filter(t => t !== tagToDelete);
      return { ...set, tags: updatedTags };
    });
    setSets(updatedSets);
    localStorage.setItem("flashcard_sets", JSON.stringify(updatedSets));
  };

  // Google Account Binding & Sheets Sync handlers
  const handleGoogleSignIn = async () => {
    try {
      setSyncError(null);
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setGoogleToken(res.accessToken);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setSyncError("Google 登入或綁定失敗：" + (err.message || err));
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await googleLogout();
      setCurrentUser(null);
      setGoogleToken(null);
      setSpreadsheetId(null);
      setLastSyncedTime(null);
      localStorage.removeItem("google_spreadsheet_id");
      localStorage.removeItem("google_sheets_last_synced");
    } catch (err: any) {
      console.error("Logout failed:", err);
    }
  };

  const handleSyncToSheets = async () => {
    let tokenToUse = googleToken;
    if (currentUser && !tokenToUse) {
      try {
        const res = await googleSignIn();
        if (res) {
          tokenToUse = res.accessToken;
          setCurrentUser(res.user);
          setGoogleToken(res.accessToken);
        } else {
          setSyncError("請先授權您的 Google 帳號以獲取 Sheets 讀寫權限。");
          return;
        }
      } catch (err: any) {
        console.error("Failed to refresh token during sync:", err);
        setSyncError("請重新授權 Google 帳號以獲取 Sheets 讀寫權限。");
        return;
      }
    }

    if (!tokenToUse) {
      try {
        const res = await googleSignIn();
        if (res) {
          tokenToUse = res.accessToken;
          setCurrentUser(res.user);
          setGoogleToken(res.accessToken);
        } else {
          setSyncError("請先登入 Google 帳號。");
          return;
        }
      } catch (err: any) {
        console.error("Failed to sign in during sync:", err);
        setSyncError("請重新授權 Google 帳號。");
        return;
      }
    }

    setIsSyncingSheets(true);
    setSyncError(null);

    try {
      let sheetId = spreadsheetId;
      if (!sheetId) {
        sheetId = await findOrCreateSpreadsheet(tokenToUse);
        setSpreadsheetId(sheetId);
        localStorage.setItem("google_spreadsheet_id", sheetId);
      }

      await syncSetsToSpreadsheet(tokenToUse, sheetId, sets, dailyProgress);

      const nowStr = new Date().toLocaleString("zh-TW", { hour12: false });
      setLastSyncedTime(nowStr);
      localStorage.setItem("google_sheets_last_synced", nowStr);
    } catch (err: any) {
      console.error("Sync to Sheets failed:", err);
      setSyncError("雲端同步失敗：" + (err.message || err));
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Voice Selection State
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURIState] = useState<string>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem("flashcard_selected_voice") || "";
    }
    return "";
  });

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const loadVoices = () => {
        const list = window.speechSynthesis.getVoices();
        setVoices(list);
        
        // Auto default to first English voice if none is selected
        const saved = localStorage.getItem("flashcard_selected_voice");
        if (!saved && list.length > 0) {
          const defaultEn = list.find(v => v.lang.startsWith("en") || v.lang.includes("en")) || list[0];
          if (defaultEn) {
            localStorage.setItem("flashcard_selected_voice", defaultEn.voiceURI);
            setSelectedVoiceURIState(defaultEn.voiceURI);
          }
        }
      };
      
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
      return () => {
        if (window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  const handleVoiceChange = (uri: string) => {
    setSelectedVoiceURIState(uri);
    localStorage.setItem("flashcard_selected_voice", uri);
  };

  // 6. Flashcard Theme/Visual Style state: 'minimalist_white' | 'deep_black' | 'soft_warm'
  const [cardStyle, setCardStyle] = useState<string>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem("flashcard_style") || "minimalist_white";
    }
    return "minimalist_white";
  });

  const handleCardStyleChange = (style: string) => {
    setCardStyle(style);
    localStorage.setItem("flashcard_style", style);
  };

  const handleAddSpacingStep = () => {
    const val = parseInt(newIntervalStep, 10);
    if (isNaN(val) || val <= 0) {
      setIntervalsError("請輸入正整數天數");
      return;
    }
    const updated = [...spacingSteps, val].sort((a, b) => a - b);
    setSpacingSteps(updated);
    setNewIntervalStep("");
    setIntervalsError(null);
  };

  const handleRemoveSpacingStep = (stepToRemove: number) => {
    if (spacingSteps.length <= 1) {
      setIntervalsError("請至少保留一個複習天數間隔！");
      return;
    }
    const updated = spacingSteps.filter(s => s !== stepToRemove);
    setSpacingSteps(updated);
    setIntervalsError(null);
  };

  const handleAddForgottenSpacingStep = () => {
    const val = parseInt(newForgottenIntervalStep, 10);
    if (isNaN(val) || val <= 0) {
      setForgottenIntervalsError("請輸入正整數天數");
      return;
    }
    const updated = [...forgottenSpacingSteps, val].sort((a, b) => a - b);
    setForgottenSpacingSteps(updated);
    setNewForgottenIntervalStep("");
    setForgottenIntervalsError(null);
  };

  const handleRemoveForgottenSpacingStep = (stepToRemove: number) => {
    if (forgottenSpacingSteps.length <= 1) {
      setForgottenIntervalsError("請至少保留一個複習天數間隔！");
      return;
    }
    const updated = forgottenSpacingSteps.filter(s => s !== stepToRemove);
    setForgottenSpacingSteps(updated);
    setForgottenIntervalsError(null);
  };

  // Create new set handler
  const handleCreateSet = (
    title: string, 
    icon: string, 
    initialCards?: Card[],
    notebookFields?: Partial<FlashcardSet>
  ) => {
    const newSet: FlashcardSet = {
      id: `set-${Date.now()}`,
      title,
      icon,
      cards: initialCards || [],
      createdAt: new Date().toISOString().split("T")[0],
      ...notebookFields
    };
    const updated = [...sets, newSet];
    setSets(updated);
    localStorage.setItem("flashcard_sets", JSON.stringify(updated));
  };

  // Delete set handler
  const handleDeleteSet = (setId: string) => {
    const updated = sets.filter(s => s.id !== setId);
    setSets(updated);
    localStorage.setItem("flashcard_sets", JSON.stringify(updated));
  };

  // Update set (adding/deleting/managing cards inside it)
  const handleUpdateSet = (
    setId: string, 
    title: string, 
    icon: string, 
    cards: Card[], 
    extraFields?: Partial<FlashcardSet>
  ) => {
    const updated = sets.map(s => {
      if (s.id === setId) {
        return { ...s, title, icon, cards, ...extraFields };
      }
      return s;
    });
    setSets(updated);
    localStorage.setItem("flashcard_sets", JSON.stringify(updated));
  };

  // Start review for a specific set
  const handleStartReview = (set: FlashcardSet, type: "all" | "forgotten") => {
    setReviewType(type);
    setActiveReviewSession(set);
  };

  // Start today's aggregated reviews (all due cards from all sets)
  const handleStartTodayReview = () => {
    if (dueCards.length === 0) return;

    // Build a virtual aggregated set of due cards
    const virtualSet: FlashcardSet = {
      id: "today-due-review-set",
      title: "今日待複習單字",
      icon: "🧠",
      cards: dueCards,
      createdAt: new Date().toISOString().split("T")[0]
    };

    setReviewType("all");
    setActiveReviewSession(virtualSet);
  };

  // Finish review session callback: update cards spacing & next dates
  const handleFinishReviewSession = (rememberedIds: string[], forgottenIds: string[], isContinueChallenge: boolean) => {
    const todayStr = new Date().toISOString().split("T")[0];

    // Count how many forgotten cards were successfully marked as remembered
    let rescuedCount = 0;
    sets.forEach(set => {
      set.cards.forEach(card => {
        if (card.status === "forgotten" && rememberedIds.includes(card.id)) {
          rescuedCount++;
        }
      });
    });

    if (rescuedCount > 0) {
      setUserStats(prev => ({
        ...prev,
        forgottenRememberedCount: prev.forgottenRememberedCount + rescuedCount
      }));
    }

    // Determine updates on master sets list
    const updatedSets = sets.map(set => {
      const updatedCards = set.cards.map(card => {
        if (rememberedIds.includes(card.id)) {
          // If remembered: increase interval and push next due date out
          const nextInterval = getNextInterval(card.intervalDays, spacingSteps);
          return {
            ...card,
            status: "remembered" as const,
            intervalDays: nextInterval,
            nextReviewDate: addDaysToDate(todayStr, nextInterval),
            history: [...card.history, { date: todayStr, status: "remembered" as const }]
          };
        } else if (forgottenIds.includes(card.id)) {
          // If forgotten: use the custom forgottenSpacingSteps interval
          let nextInterval;
          if (card.status === "forgotten") {
            nextInterval = getNextInterval(card.intervalDays, forgottenSpacingSteps);
          } else {
            nextInterval = forgottenSpacingSteps[0] || 1;
          }
          return {
            ...card,
            status: "forgotten" as const,
            intervalDays: nextInterval,
            nextReviewDate: addDaysToDate(todayStr, nextInterval),
            history: [...card.history, { date: todayStr, status: "forgotten" as const }]
          };
        }
        return card;
      });
      return { ...set, cards: updatedCards };
    });

    setSets(updatedSets);
    localStorage.setItem("flashcard_sets", JSON.stringify(updatedSets));

    // Update progress history logs
    const updatedProgress = [...dailyProgress];
    const todayLogIdx = updatedProgress.findIndex(p => p.date === todayStr);

    if (todayLogIdx !== -1) {
      updatedProgress[todayLogIdx] = {
        ...updatedProgress[todayLogIdx],
        remembered: updatedProgress[todayLogIdx].remembered + rememberedIds.length,
        forgotten: updatedProgress[todayLogIdx].forgotten + forgottenIds.length,
      };
    } else {
      updatedProgress.push({
        date: todayStr,
        remembered: rememberedIds.length,
        forgotten: forgottenIds.length
      });
    }

    setDailyProgress(updatedProgress);
    localStorage.setItem("flashcard_progress", JSON.stringify(updatedProgress));

    // Continue challenge logic:
    if (isContinueChallenge && activeReviewSession) {
      // Create a sub-session of only the forgotten cards
      const activeSetId = activeReviewSession.id;
      
      // If virtual set, rebuild the virtual set with only the cards that were forgotten in this session
      if (activeSetId === "today-due-review-set") {
        const remainingForgottenCards = activeReviewSession.cards.filter(c => forgottenIds.includes(c.id));
        const virtualSet: FlashcardSet = {
          id: "today-due-review-set",
          title: "繼續挑戰 - 遺忘單字",
          icon: "🧠",
          cards: remainingForgottenCards,
          createdAt: todayStr
        };
        setReviewType("all");
        setActiveReviewSession(virtualSet);
      } else {
        // Standard set: reload from updated sets, filter forgotten
        const refreshedSet = updatedSets.find(s => s.id === activeSetId);
        if (refreshedSet) {
          setActiveReviewSession(refreshedSet);
          setReviewType("forgotten");
        } else {
          setActiveReviewSession(null);
        }
      }
    } else {
      // Exit review session completely
      setActiveReviewSession(null);
    }
  };

  const totalRememberedCount = sets.reduce((acc, s) => {
    return acc + s.cards.filter(c => c.status === "remembered").length;
  }, 0);

  const evaluatedBadges = BADGES.map(badge => {
    let currentValue = 0;
    if (badge.category === "remembered") {
      currentValue = totalRememberedCount;
    } else if (badge.category === "forgotten_remembered") {
      currentValue = userStats.forgottenRememberedCount;
    } else if (badge.category === "perfect_quiz") {
      currentValue = userStats.quizPerfectCount;
    }
    const isUnlocked = currentValue >= badge.requirementValue;
    return { ...badge, isUnlocked, currentValue };
  });

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col font-sans">
      {/* Visual Navigation Bar */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-5xl w-full mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-blue-500 rounded-lg text-white flex items-center justify-center">
              <GraduationCap size={20} />
            </span>
            <div>
              <h1 className="text-gray-800 font-extrabold text-lg tracking-tight leading-tight">
                單字卡學習助手 <span className="text-xs text-gray-400 font-normal">Memora</span>
              </h1>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                Spaced Repetition System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block text-[10px] text-gray-400 font-bold bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
              遺忘曲線模式 • 運行中
            </span>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="調整複習間隔及選擇人聲與樣式"
            >
              <Settings size={14} />
              設定
            </button>
            <button
              onClick={() => setIsBadgesOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="檢視我的成就勳章"
            >
              <Trophy size={14} className="text-amber-500" />
              成就勳章 ({evaluatedBadges.filter(b => b.isUnlocked).length})
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-5xl w-full mx-auto px-6 py-8 flex-1">
        <HomeView
          sets={sets}
          dailyProgress={dailyProgress}
          onStartReview={handleStartReview}
          onStartTodayReview={handleStartTodayReview}
          onCreateSet={handleCreateSet}
          onDeleteSet={handleDeleteSet}
          onUpdateSet={handleUpdateSet}
          dueCardsCount={dueCards.length}
          onOpenNotebook={setActiveNotebookWorkspace}
          onOpenQuiz={setActiveQuizSet}
          evaluatedBadges={evaluatedBadges}
          onOpenBadges={() => setIsBadgesOpen(true)}
          categories={categories}
          onAddCategory={handleAddCategory}
          onEditCategory={handleEditCategory}
          onDeleteCategory={handleDeleteCategory}
          currentUser={currentUser}
          isSyncingSheets={isSyncingSheets}
          syncError={syncError}
          spreadsheetId={spreadsheetId}
          lastSyncedTime={lastSyncedTime}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleLogout={handleGoogleLogout}
          onSyncToSheets={handleSyncToSheets}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 text-center bg-white">
        <p className="text-xs text-gray-400 font-medium">
          單字卡學習助手 • 簡潔、純粹、高效的拼圖記憶體驗
        </p>
      </footer>

      {/* Active Review Overlay Modal */}
      {activeReviewSession && (
        <ReviewSession
          key={`${activeReviewSession.id}-${reviewType}-${activeReviewSession.cards.map(c => c.id + '-' + c.status).join(',')}`}
          set={activeReviewSession}
          reviewType={reviewType}
          cardStyle={cardStyle}
          onClose={() => setActiveReviewSession(null)}
          onFinishReview={handleFinishReviewSession}
        />
      )}

      {/* NotebookLM Study Workspace Overlay */}
      {activeNotebook && (
        <NotebookWorkspace
          set={activeNotebook}
          onClose={() => setActiveNotebookWorkspace(null)}
          onUpdateSet={handleUpdateSet}
        />
      )}

      {/* Settings Overlay Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white w-full max-w-2xl rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col relative max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="border-b border-gray-100 px-6 py-5 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 bg-blue-100 text-blue-600 rounded-xl">
                  <Settings size={20} />
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">設定</h3>
                  <p className="text-[10px] text-gray-400 font-semibold">自訂您的學習參數、朗讀人聲與單字卡視覺樣式</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setIntervalsError(null);
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Voice Selection Section */}
              <div className="bg-gradient-to-r from-blue-50/20 to-purple-50/20 p-5 rounded-2xl border border-blue-100/30 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🔊</span> 英文 AI 朗讀人聲 (Web TTS Voices)
                  </h4>
                  <span className="text-[10px] bg-blue-100 text-blue-700 font-extrabold px-2 py-0.5 rounded-md">
                    支援多種英美/口音
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  本系統內建單字卡與例句朗讀。您可以在下方選擇最適合您的發音人聲（將自動讀取您系統與瀏覽器支援的發音引擎）。
                </p>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <select
                    value={selectedVoiceURI}
                    onChange={(e) => handleVoiceChange(e.target.value)}
                    className="flex-1 bg-white border border-gray-200/80 hover:border-gray-300 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-blue-500 font-bold text-slate-700 shadow-xs"
                  >
                    {voices.length === 0 ? (
                      <option value="">載入系統語音中...</option>
                    ) : (
                      <>
                        <option value="">系統預設 (自動偵測)</option>
                        {/* Sort English voices to the top for convenience */}
                        {[...voices]
                          .sort((a, b) => {
                            const aEn = a.lang.startsWith("en") ? 1 : 0;
                            const bEn = b.lang.startsWith("en") ? 1 : 0;
                            return bEn - aEn;
                          })
                          .map((voice) => (
                            <option key={voice.voiceURI} value={voice.voiceURI}>
                              {voice.name} ({voice.lang}) {voice.localService ? "• 離線" : ""}
                            </option>
                          ))}
                      </>
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      speak("Hello, wonderful learner! This is a test pronunciation using your selected AI voice. Keep up the amazing work!");
                    }}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-blue-100/50"
                  >
                    測試人聲播放
                  </button>
                </div>
              </div>

              {/* Flashcard Theme Selection Section */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🎨</span> 單字卡視覺樣式 (Flashcard Theme Style)
                  </h4>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-extrabold px-2 py-0.5 rounded-md">
                    自訂顯示色系
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  選擇您偏好的單字卡卡片色調，此樣式將會套用於卡片複習中的實體單字卡設計。
                </p>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "minimalist_white", name: "極簡白", desc: "純白高對比", previewBg: "bg-white text-gray-800 border-gray-200" },
                    { id: "deep_black", name: "深邃黑", desc: "暗黑護眼", previewBg: "bg-slate-950 text-slate-100 border-slate-800" },
                    { id: "soft_warm", name: "柔和暖色", desc: "舒緩溫潤", previewBg: "bg-[#FCF9F2] text-[#4F3C24] border-[#EADFC9]" },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleCardStyleChange(theme.id)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                        cardStyle === theme.id
                          ? "border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                          : "border-gray-200 hover:border-gray-300"
                      } bg-white`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-800">{theme.name}</span>
                        {cardStyle === theme.id && (
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                        )}
                      </div>
                      
                      {/* Live Mini Preview Box */}
                      <div className={`w-full h-11 rounded-lg border flex items-center justify-center font-mono text-[10px] font-bold ${theme.previewBg}`}>
                        Aa
                      </div>
                      <p className="text-[9px] text-gray-400 font-semibold text-center mt-1.5">{theme.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Spacing Steps / Forgetting Curve Section */}
              <div className="space-y-6 pt-4 border-t border-slate-100">
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                  <span>📅</span> 自訂雙向間隔曲線 (Double Forgetting Curves)
                </h3>

                {/* 1. Remembered Spacing Steps */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/50 space-y-4">
                  <div className="text-xs text-slate-700 leading-relaxed space-y-1">
                    <p className="font-extrabold flex items-center gap-1 text-slate-800">
                      <span className="text-emerald-500">🟢</span> 「記得的單字」複習間隔階梯
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      當您標記「記得」時，字卡的複習間隔會往下一階推展（例如：目前是 2 天，下次會是 4 天後）。
                    </p>
                  </div>

                  {/* Remembered Steps List */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 items-center p-3.5 bg-white rounded-xl border border-gray-100 shadow-xs">
                      {spacingSteps.map((stepVal, idx) => (
                        <div
                          key={`rem-${idx}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50/50 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-100 shadow-xs group"
                        >
                          <span className="font-mono text-emerald-600/60 text-[10px]">#{idx + 1}</span>
                          <span className="text-emerald-700 font-extrabold">{stepVal}</span>
                          <span className="text-emerald-600/80">天</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (spacingSteps.length <= 1) {
                                setIntervalsError("請至少保留一個記得的複習天數間隔！");
                                return;
                              }
                              handleRemoveSpacingStep(stepVal);
                              setIntervalsError(null);
                            }}
                            className="ml-1 text-emerald-400 hover:text-red-500 transition-colors cursor-pointer"
                            title="刪除此階梯"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add Remembered Step Control */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-gray-500">
                        新增自訂天數間隔 (正整數天)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          placeholder="例如: 10"
                          value={newIntervalStep}
                          onChange={e => {
                            setNewIntervalStep(e.target.value);
                            setIntervalsError(null);
                          }}
                          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleAddSpacingStep}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          <Plus size={14} />
                          新增
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col justify-end space-y-1.5">
                      <label className="block text-[11px] font-bold text-gray-400">
                        恢復系統預設「記得」曲線
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setSpacingSteps([1, 2, 4, 7, 15, 30, 60]);
                          setIntervalsError(null);
                        }}
                        className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition-all cursor-pointer border border-gray-200/50 text-center flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw size={12} />
                        恢復預設 (1, 2, 4, 7, 15, 30, 60 天)
                      </button>
                    </div>
                  </div>

                  {intervalsError && (
                    <p className="text-[11px] text-rose-500 font-bold bg-rose-50 border border-rose-100 p-2.5 rounded-xl">
                      ⚠️ {intervalsError}
                    </p>
                  )}
                </div>

                {/* 2. Forgotten Spacing Steps */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/50 space-y-4">
                  <div className="text-xs text-slate-700 leading-relaxed space-y-1">
                    <p className="font-extrabold flex items-center gap-1 text-slate-800">
                      <span className="text-amber-500">🟡</span> 「遺忘的單字」複習間隔階梯
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      當您標記「遺忘」時，字卡會進入更緊密的遺忘曲線中，間隔將從首階開始或按此階梯遞增複習。
                    </p>
                  </div>

                  {/* Forgotten Steps List */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 items-center p-3.5 bg-white rounded-xl border border-gray-100 shadow-xs">
                      {forgottenSpacingSteps.map((stepVal, idx) => (
                        <div
                          key={`forg-${idx}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50/50 text-amber-800 rounded-lg text-xs font-bold border border-amber-100 shadow-xs group"
                        >
                          <span className="font-mono text-amber-600/60 text-[10px]">#{idx + 1}</span>
                          <span className="text-amber-700 font-extrabold">{stepVal}</span>
                          <span className="text-amber-600/80">天</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (forgottenSpacingSteps.length <= 1) {
                                setForgottenIntervalsError("請至少保留一個遺忘的複習天數間隔！");
                                return;
                              }
                              handleRemoveForgottenSpacingStep(stepVal);
                              setForgottenIntervalsError(null);
                            }}
                            className="ml-1 text-amber-400 hover:text-red-500 transition-colors cursor-pointer"
                            title="刪除此階梯"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add Forgotten Step Control */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-gray-500">
                        新增自訂天數間隔 (正整數天)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          placeholder="例如: 3"
                          value={newForgottenIntervalStep}
                          onChange={e => {
                            setNewForgottenIntervalStep(e.target.value);
                            setForgottenIntervalsError(null);
                          }}
                          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleAddForgottenSpacingStep}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          <Plus size={14} />
                          新增
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col justify-end space-y-1.5">
                      <label className="block text-[11px] font-bold text-gray-400">
                        恢復系統預設「遺忘」曲線
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgottenSpacingSteps([1, 2, 3, 5]);
                          setForgottenIntervalsError(null);
                        }}
                        className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition-all cursor-pointer border border-gray-200/50 text-center flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw size={12} />
                        恢復預設 (1, 2, 3, 5 天)
                      </button>
                    </div>
                  </div>

                  {forgottenIntervalsError && (
                    <p className="text-[11px] text-rose-500 font-bold bg-rose-50 border border-rose-100 p-2.5 rounded-xl">
                      ⚠️ {forgottenIntervalsError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-100 px-6 py-4 flex justify-end bg-gray-50/30">
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setIntervalsError(null);
                  setForgottenIntervalsError(null);
                }}
                className="px-5 py-2 bg-slate-850 hover:bg-slate-750 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                關閉並套用
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Achievements Overlay Modal */}
      {isBadgesOpen && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-[#FAFAFC] w-full max-w-2xl rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col relative max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="border-b border-gray-100 px-6 py-5 flex items-center justify-between bg-amber-500 text-white shadow-md">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 bg-amber-600 rounded-xl text-white flex items-center justify-center">
                  <Trophy size={20} className="text-yellow-200 animate-bounce" />
                </span>
                <div>
                  <h3 className="font-extrabold text-base text-white">我的勳章成就榮譽館</h3>
                  <p className="text-[10px] text-amber-100 font-semibold">記住、複習、拿滿分來收集各類創意徽章</p>
                </div>
              </div>
              <button
                onClick={() => setIsBadgesOpen(false)}
                className="p-1.5 text-amber-100 hover:text-white rounded-lg hover:bg-amber-600 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* User progress stats dashboard */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 p-3.5 rounded-2xl text-center shadow-xs">
                  <span className="text-xl">🌱</span>
                  <div className="text-[10px] text-gray-400 font-bold mt-1">累計記住單字</div>
                  <div className="text-base font-extrabold text-blue-600 mt-0.5">
                    {totalRememberedCount} <span className="text-[10px] text-gray-400 font-medium">個</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-100/50 p-3.5 rounded-2xl text-center shadow-xs">
                  <span className="text-xl">🛡️</span>
                  <div className="text-[10px] text-gray-400 font-bold mt-1">拯救遺忘單字</div>
                  <div className="text-base font-extrabold text-purple-600 mt-0.5">
                    {userStats.forgottenRememberedCount} <span className="text-[10px] text-gray-400 font-medium">個</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100/50 p-3.5 rounded-2xl text-center shadow-xs">
                  <span className="text-xl">🎯</span>
                  <div className="text-[10px] text-gray-400 font-bold mt-1">測驗滿分次數</div>
                  <div className="text-base font-extrabold text-emerald-600 mt-0.5">
                    {userStats.quizPerfectCount} <span className="text-[10px] text-gray-400 font-medium">次</span>
                  </div>
                </div>
              </div>

              {/* Categorized Achievements List */}
              <div className="space-y-6">
                {[
                  {
                    title: "🌱 單字累積里程碑 (Vocabulary Milestones)",
                    categoryKey: "remembered",
                    badgeColor: "border-blue-100 hover:border-blue-200",
                    unlockedBg: "bg-blue-50/20"
                  },
                  {
                    title: "🛡️ 遺忘挽救勳章 (Forgotten & Rescued)",
                    categoryKey: "forgotten_remembered",
                    badgeColor: "border-purple-100 hover:border-purple-200",
                    unlockedBg: "bg-purple-50/20"
                  },
                  {
                    title: "🎯 精準測驗大師 (Quiz Mastery)",
                    categoryKey: "perfect_quiz",
                    badgeColor: "border-emerald-100 hover:border-emerald-200",
                    unlockedBg: "bg-emerald-50/20"
                  }
                ].map((section, sIdx) => {
                  const categoryBadges = evaluatedBadges.filter(b => b.category === section.categoryKey);
                  return (
                    <div key={sIdx} className="space-y-3">
                      <div className="flex items-center justify-between border-b border-gray-200 pb-1.5">
                        <h4 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider flex items-center gap-1">
                          {section.title}
                        </h4>
                        <span className="text-[10px] bg-slate-100 text-slate-500 font-extrabold px-2 py-0.5 rounded-full border border-slate-200/50">
                          {categoryBadges.filter(b => b.isUnlocked).length} / {categoryBadges.length} 已解鎖
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {categoryBadges.map((badge, idx) => (
                          <div
                            key={idx}
                            className={`p-3.5 rounded-2xl border transition-all flex gap-3 relative overflow-hidden bg-white ${
                              badge.isUnlocked
                                ? `${section.unlockedBg} border-amber-200/70 shadow-xs`
                                : "border-slate-150/70 opacity-60 hover:opacity-80"
                            }`}
                          >
                            {badge.isUnlocked && (
                              <div className="absolute -right-6 -bottom-6 text-amber-500/10 text-6xl select-none rotate-12">
                                {badge.icon}
                              </div>
                            )}

                            {/* Badge Icon circle */}
                            <div 
                              className={`w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-xl shadow-xs border ${
                                badge.isUnlocked
                                  ? "bg-amber-100 border-amber-200 text-amber-600"
                                  : "bg-slate-100 border-slate-200"
                              }`}
                              style={!badge.isUnlocked ? {
                                filter: "grayscale(40%) saturate(60%) brightness(95%)",
                                opacity: 0.85
                              } : undefined}
                            >
                              {badge.icon}
                            </div>

                            {/* Badge details */}
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`font-extrabold text-xs truncate ${badge.isUnlocked ? "text-amber-800" : "text-gray-500"}`}>
                                  {badge.name}
                                </span>
                                {badge.isUnlocked ? (
                                  <span className="text-[8px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">
                                    已獲得
                                  </span>
                                ) : (
                                  <span className="text-[8px] bg-gray-200 text-gray-500 font-bold px-1.5 py-0.5 rounded-full">
                                    未達成
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-400 font-semibold">
                                條件：{badge.requirementText}
                              </p>
                              <p className="text-[10px] text-gray-500 font-medium leading-relaxed mt-1">
                                {badge.description}
                              </p>

                              {/* Simple progress bar */}
                              <div className="mt-2.5 space-y-1">
                                <div className="flex justify-between text-[8px] text-gray-400 font-bold">
                                  <span>目前進度</span>
                                  <span>{Math.min(badge.currentValue, badge.requirementValue)} / {badge.requirementValue}</span>
                                </div>
                                <div className="w-full bg-gray-150 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${badge.isUnlocked ? "bg-amber-500" : "bg-blue-400"}`}
                                    style={{ width: `${Math.min((badge.currentValue / badge.requirementValue) * 100, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-100 px-6 py-4 flex justify-end bg-gray-50/30">
              <button
                type="button"
                onClick={() => setIsBadgesOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                關閉並返回
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* AI Quiz Generator Overlay */}
      {activeQuiz && (
        <QuizWorkspace
          set={activeQuiz}
          onClose={() => setActiveQuizSet(null)}
          onUpdateSet={handleUpdateSet}
          forgottenSpacingSteps={forgottenSpacingSteps}
          onRecordQuizPerfectScore={() => {
            setUserStats(prev => ({
              ...prev,
              quizPerfectCount: (prev.quizPerfectCount || 0) + 1
            }));
          }}
        />
      )}
    </div>
  );
}
