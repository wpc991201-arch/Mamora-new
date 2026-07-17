import { FlashcardSet } from "../types";

// Helper to get relative dates
const getRelativeDate = (daysAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
};

export const DEFAULT_SETS: FlashcardSet[] = [
  {
    id: "set-1",
    title: "日常對話實用單字",
    icon: "💬",
    createdAt: getRelativeDate(5),
    tags: ["生活實用", "雅思"],
    cards: [
      {
        id: "card-1-1",
        word: "ambiguous",
        translation: "模稜兩可的",
        pos: "adj.",
        example: "The instructions he gave were ambiguous and confusing.",
        exampleTranslation: "他給的指示模稜兩可，令人困惑。",
        status: "learning",
        nextReviewDate: getRelativeDate(0), // Due today!
        intervalDays: 1,
        history: []
      },
      {
        id: "card-1-2",
        word: "resilient",
        translation: "有韌性的；適應力強的",
        pos: "adj.",
        example: "She is a resilient girl who bounces back quickly from setbacks.",
        exampleTranslation: "她是一個有韌性的女孩，能迅速從挫折中恢復過來。",
        status: "learning",
        nextReviewDate: getRelativeDate(0), // Due today!
        intervalDays: 1,
        history: []
      },
      {
        id: "card-1-3",
        word: "meticulous",
        translation: "一絲不苟的；小心的",
        pos: "adj.",
        example: "The researcher kept meticulous records of the experiments.",
        exampleTranslation: "研究人員對實驗進行了極其細緻一絲不苟的記錄。",
        status: "remembered",
        nextReviewDate: getRelativeDate(-1), // Due tomorrow (not today)
        intervalDays: 2,
        history: [{ date: getRelativeDate(1), status: "remembered" }]
      },
      {
        id: "card-1-4",
        word: "procrastinate",
        translation: "拖延；延遲",
        pos: "v.",
        example: "If you procrastinate, you will miss the application deadline.",
        exampleTranslation: "如果你拖延，你將會錯過申請截止日期。",
        status: "learning",
        nextReviewDate: getRelativeDate(1), // Past due (due yesterday!)
        intervalDays: 1,
        history: []
      }
    ]
  },
  {
    id: "set-2",
    title: "科技與軟體開發",
    icon: "💻",
    createdAt: getRelativeDate(10),
    tags: ["商務英語", "專業英語"],
    cards: [
      {
        id: "card-2-1",
        word: "synchronize",
        translation: "使同步",
        pos: "v.",
        example: "You need to synchronize your calendar with your phone.",
        exampleTranslation: "你需要將你的行事曆與手機同步。",
        status: "learning",
        nextReviewDate: getRelativeDate(0), // Due today!
        intervalDays: 1,
        history: []
      },
      {
        id: "card-2-2",
        word: "deprecate",
        translation: "反對；不贊成（在科技中常指聲明折舊、廢棄）",
        pos: "v.",
        example: "They decided to deprecate the old API in the next release.",
        exampleTranslation: "他們決定在下一個版本中廢棄舊的 API。",
        status: "learning",
        nextReviewDate: getRelativeDate(-3), // Safe
        intervalDays: 4,
        history: [{ date: getRelativeDate(5), status: "remembered" }]
      },
      {
        id: "card-2-3",
        word: "redundancy",
        translation: "多餘；重複；備份備用",
        pos: "n.",
        example: "Data redundancy is used to ensure system reliability.",
        exampleTranslation: "數據冗餘（備份）被用來確保系統的可靠性。",
        status: "learning",
        nextReviewDate: getRelativeDate(0), // Due today
        intervalDays: 1,
        history: []
      }
    ]
  },
  {
    id: "set-3",
    title: "多益常考商務英語",
    icon: "📈",
    createdAt: getRelativeDate(3),
    tags: ["多益", "商務英語"],
    cards: [
      {
        id: "card-3-1",
        word: "collaborate",
        translation: "合作；協作",
        pos: "v.",
        example: "Teams from both departments will collaborate on this project.",
        exampleTranslation: "兩個部門的團隊將共同協作這個專案。",
        status: "learning",
        nextReviewDate: getRelativeDate(0), // Due today
        intervalDays: 1,
        history: []
      },
      {
        id: "card-3-2",
        word: "allocate",
        translation: "分配；分派",
        pos: "v.",
        example: "The company will allocate a budget for employee training.",
        exampleTranslation: "公司將會撥出（分配）一筆預算用於員工培訓。",
        status: "learning",
        nextReviewDate: getRelativeDate(0), // Due today
        intervalDays: 1,
        history: []
      }
    ]
  }
];
