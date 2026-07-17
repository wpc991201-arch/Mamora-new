import React, { useState, useRef } from "react";
import { FlashcardSet, Card, DailyProgress, EvaluatedBadge } from "../types";
import { 
  Plus, Upload, Sparkles, BookOpen, ChevronRight, Play, AlertCircle, 
  Trash2, Edit3, Check, Calendar, History, Eye, Settings, HelpCircle, 
  Smile, ChevronDown, CheckCircle2, RefreshCw, Loader2, Info, X,
  FileText, Image as ImageIcon, Link as LinkIcon, Tag, Trophy
} from "lucide-react";
import { parseCSV } from "../utils/csv";

interface HomeViewProps {
  sets: FlashcardSet[];
  dailyProgress: DailyProgress[];
  onStartReview: (set: FlashcardSet, type: "all" | "forgotten") => void;
  onStartTodayReview: () => void;
  onCreateSet: (title: string, icon: string, initialCards?: Card[], notebookFields?: Partial<FlashcardSet>) => void;
  onDeleteSet: (setId: string) => void;
  onUpdateSet: (setId: string, title: string, icon: string, cards: Card[], extraFields?: Partial<FlashcardSet>) => void;
  dueCardsCount: number;
  onOpenNotebook: (set: FlashcardSet) => void;
  onOpenQuiz: (set: FlashcardSet) => void;
  evaluatedBadges: EvaluatedBadge[];
  onOpenBadges: () => void;
  categories: string[];
  onAddCategory: (tag: string) => void;
  onEditCategory: (oldTag: string, newTag: string) => void;
  onDeleteCategory: (tag: string) => void;
  // Google sync props
  currentUser: any;
  isSyncingSheets: boolean;
  syncError: string | null;
  spreadsheetId: string | null;
  lastSyncedTime: string | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onSyncToSheets: () => Promise<void>;
}

// Simple emojis list for customization
const EMOJIS = ["💬", "💻", "📈", "🌍", "🚀", "💡", "🧠", "🎨", "🎵", "🧬", "🍱", "✈️", "🏀", "🍕", "🔑"];

export default function HomeView({
  sets,
  dailyProgress,
  onStartReview,
  onStartTodayReview,
  onCreateSet,
  onDeleteSet,
  onUpdateSet,
  dueCardsCount,
  onOpenNotebook,
  onOpenQuiz,
  evaluatedBadges,
  onOpenBadges,
  categories,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  // Google sync props
  currentUser,
  isSyncingSheets,
  syncError,
  spreadsheetId,
  lastSyncedTime,
  onGoogleSignIn,
  onGoogleLogout,
  onSyncToSheets
}: HomeViewProps) {
  // Chart duration state: '3days' | '1week' | '1month'
  const [chartRange, setChartRange] = useState<"3days" | "1week" | "1month">("1week");

  // Accordion active set ID
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  const unlockedBadges = evaluatedBadges.filter(b => b.isUnlocked);
  const inProgressBadges = [...evaluatedBadges]
    .filter(b => !b.isUnlocked)
    .sort((a, b) => {
      const completionA = a.currentValue / a.requirementValue;
      const completionB = b.currentValue / b.requirementValue;
      return completionB - completionA;
    });

  // Tag filter & customization states
  const [selectedFilterTag, setSelectedFilterTag] = useState<string | null>(null);
  const [newSetTags, setNewSetTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");

  // Category Management Modal states
  const [isManageCategoriesModalOpen, setIsManageCategoriesModalOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [categoryEditError, setCategoryEditError] = useState<string | null>(null);
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState("");

  const handleAddNewCategory = () => {
    const val = newCategoryInput.trim();
    if (!val) {
      setCategoryEditError("請輸入分類名稱");
      return;
    }
    if (categories.includes(val)) {
      setCategoryEditError("該分類名稱已存在");
      return;
    }
    onAddCategory(val);
    setNewCategoryInput("");
    setCategoryEditError(null);
  };

  const handleSaveEditCategory = (index: number) => {
    const oldTag = categories[index];
    const val = editingCategoryValue.trim();
    if (!val) {
      setCategoryEditError("分類名稱不能為空");
      return;
    }
    if (oldTag !== val && categories.includes(val)) {
      setCategoryEditError("該分類名稱已存在");
      return;
    }
    onEditCategory(oldTag, val);
    setEditingCategoryIndex(null);
    setEditingCategoryValue("");
    setCategoryEditError(null);
  };

  // Get all unique tags currently in the sets list (to show in filter bar)
  const availableTags = Array.from(
    new Set(sets.flatMap(s => s.tags || []))
  ).filter(Boolean);

  const filteredSets = selectedFilterTag
    ? sets.filter(s => s.tags && s.tags.includes(selectedFilterTag))
    : sets;

  // Modal states for creating/editing set
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSetTitle, setNewSetTitle] = useState("");
  const [newSetIcon, setNewSetIcon] = useState("💬");

  // Dual-mode creation states
  const [createMode, setCreateMode] = useState<"manual" | "ai">("manual");
  const [aiSourceType, setAiSourceType] = useState<"text" | "image" | "url">("text");
  const [aiDetailLevel, setAiDetailLevel] = useState<"low" | "medium" | "high">("medium");
  const [aiInputText, setAiInputText] = useState("");
  const [aiInputUrl, setAiInputUrl] = useState("");
  const [aiInputImage, setAiInputImage] = useState<string | null>(null);
  const [aiInputImageName, setAiInputImageName] = useState("");
  const [aiInputImages, setAiInputImages] = useState<Array<{ base64: string; name: string }>>([]);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiParseError, setAiParseError] = useState<string | null>(null);
  const [aiParsedResult, setAiParsedResult] = useState<any>(null);

  // Image Ref for AI OCR Uploads
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  // Modal states for viewing/editing card items within a set
  const [editingSet, setEditingSet] = useState<FlashcardSet | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);

  // Edit-set specific AI Import states (to append words to current set)
  const [editModalAiOpen, setEditModalAiOpen] = useState(false);

  // New Word Form State
  const [newWord, setNewWord] = useState("");
  const [newTranslation, setNewTranslation] = useState("");
  const [newPos, setNewPos] = useState("");
  const [newExample, setNewExample] = useState("");
  const [newExampleTranslation, setNewExampleTranslation] = useState("");
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // CSV Import States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Parse Text File helper
  const handleTextFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = () => {
      setAiInputText(reader.result as string);
    };
    reader.onerror = () => {
      setAiParseError("檔案讀取失敗，請確認為純文字檔 (.txt, .md, .csv 等)");
    };
    reader.readAsText(file);
  };

  // Parse Image File helper for OCR (supports up to 10 images)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 10 - aiInputImages.length;
    if (remainingSlots <= 0) {
      setAiParseError("上傳的照片數已達上限 10 張！");
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots) as File[];
    if (files.length > remainingSlots) {
      setAiParseError(`一次最多上傳 10 張照片，已自動為您選取前 ${remainingSlots} 張。`);
    }

    const processedImages: Array<{ base64: string; name: string }> = [];
    let loadedCount = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const reader = new FileReader();
      reader.onload = () => {
        processedImages.push({
          base64: reader.result as string,
          name: file.name
        });
        loadedCount++;
        if (loadedCount === filesToProcess.length) {
          const updatedImages = [...aiInputImages, ...processedImages].slice(0, 10);
          setAiInputImages(updatedImages);
          if (updatedImages.length > 0) {
            setAiInputImage(updatedImages[0].base64);
            setAiInputImageName(updatedImages[0].name);
          }
        }
      };
      reader.onerror = () => {
        setAiParseError("部分圖片讀取失敗，請重新上傳");
      };
      reader.readAsDataURL(file);
    }
  };

  // Map AI Result schema to Card Schema
  const mapAiResultToCards = (cardsFromAi: any[]): Card[] => {
    return cardsFromAi.map((card, idx) => ({
      id: `card-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      word: card.word || "Unknown",
      translation: card.translation || "無翻譯",
      pos: card.pos || "adj.",
      example: card.example || "",
      exampleTranslation: card.exampleTranslation || "",
      status: "learning" as const,
      nextReviewDate: new Date().toISOString().split("T")[0],
      intervalDays: 1,
      history: []
    }));
  };

  // AI Parser API Client call
  const handleAiParse = async () => {
    setIsAiParsing(true);
    setAiParseError(null);
    setAiParsedResult(null);

    try {
      let bodyData: any = { sourceType: aiSourceType, detailLevel: aiDetailLevel };

      if (aiSourceType === "text") {
        if (!aiInputText.trim()) throw new Error("請先輸入或上傳文字內容");
        bodyData.text = aiInputText;
      } else if (aiSourceType === "url") {
        if (!aiInputUrl.trim() || !aiInputUrl.startsWith("http")) {
          throw new Error("請輸入有效的網址 (需以 http:// 或 https:// 開頭)");
        }
        bodyData.url = aiInputUrl;
      } else if (aiSourceType === "image") {
        if (aiInputImages.length === 0) throw new Error("請先選擇或拍攝至少一張包含英文的相片上傳");
        bodyData.images = aiInputImages.map(img => img.base64);
        bodyData.image = aiInputImages[0].base64; // Fallback for backward compatibility
      }

      const res = await fetch("/api/generate-notebook-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "AI 解析失敗，請確認輸入內容是否正常");
      }

      const data = await res.json();
      setAiParsedResult(data);
      
      // Update Title & Icon placeholders based on AI suggestions
      setNewSetTitle(data.title || "AI 智慧產生單字組");
      setNewSetIcon(data.icon || "🧠");
    } catch (err: any) {
      setAiParseError(err.message || "發生未知錯誤");
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleCreateSetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetTitle.trim()) return;

    if (createMode === "ai" && aiParsedResult) {
      const generatedCards = mapAiResultToCards(aiParsedResult.cards);
      
      // Determine the source text to store
      let originalSourceText = "";
      if (aiSourceType === "text") {
        originalSourceText = aiInputText;
      } else if (aiSourceType === "url") {
        originalSourceText = aiInputUrl;
      } else if (aiSourceType === "image") {
        originalSourceText = `OCR 圖片辨識結果: 已辨識 ${aiInputImages.map(img => img.name).join(", ")} 共 ${aiInputImages.length} 張圖片`;
      }

      onCreateSet(newSetTitle.trim(), newSetIcon, generatedCards, {
        sourceText: originalSourceText,
        sourceType: aiSourceType,
        sourceUrl: aiSourceType === "url" ? aiInputUrl : undefined,
        studyGuideSummary: aiParsedResult.summary,
        studyGuideGrammar: aiParsedResult.keyGrammar,
        studyGuideFaqs: aiParsedResult.faqs,
        tags: newSetTags,
        chatMessages: [
          {
            id: `chat-init-${Date.now()}`,
            sender: "ai",
            text: `哈囉！我是您的 NotebookLM 智慧讀書助理。我已經深入閱讀並分析了這篇來源資料，並且：\n\n1. 幫您編寫了完整的「學習導讀與精華」\n2. 整理出「核心單字卡」與「文法/搭配詞解析」\n3. 準備了幾題「閱讀理解問答（FAQ）」\n\n您可以隨時在下方對我提問，我會根據本文內容來為您解惑、造句、或進行小測驗喔！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]
      });
    } else {
      onCreateSet(newSetTitle.trim(), newSetIcon, [], { tags: newSetTags });
    }

    // Reset Form
    setNewSetTitle("");
    setNewSetIcon("💬");
    setNewSetTags([]);
    setCustomTagInput("");
    setCreateMode("manual");
    setAiParsedResult(null);
    setAiInputText("");
    setAiInputUrl("");
    setAiInputImage(null);
    setAiInputImageName("");
    setIsCreateModalOpen(false);
  };

  // Helper to filter daily progress
  const getFilteredProgress = (): DailyProgress[] => {
    const today = new Date();
    let daysToKeep = 7;
    if (chartRange === "3days") daysToKeep = 3;
    if (chartRange === "1month") daysToKeep = 30;

    const limitDate = new Date();
    limitDate.setDate(today.getDate() - daysToKeep);

    // Filter and sort by date ascending
    return dailyProgress
      .filter(p => new Date(p.date) >= limitDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const filteredProgress = getFilteredProgress();

  // Find max value for scaling charts
  const maxProgressValue = Math.max(
    ...filteredProgress.map(p => p.remembered + p.forgotten),
    5 // Default baseline to prevent divide-by-zero
  );

  // Start adding/managing words in a set
  const handleOpenEditSet = (set: FlashcardSet) => {
    setEditingSet(set);
    setIsEditModalOpen(true);
    setGenerationError(null);
    setEditingCardId(null);
    setNewWord("");
    setNewTranslation("");
    setNewPos("");
    setNewExample("");
    setNewExampleTranslation("");
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingSet(null);
    setEditingCardId(null);
    setNewWord("");
    setNewTranslation("");
    setNewPos("");
    setNewExample("");
    setNewExampleTranslation("");
    setGenerationError(null);
  };

  // Handle auto-generating card details using Gemini API
  const handleAutoGenerateDetails = async () => {
    if (!newWord.trim()) return;
    setIsGeneratingCard(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/generate-card-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: newWord.trim(),
          customTranslation: newTranslation.trim() || undefined,
          customPos: newPos.trim() || undefined,
          customExample: newExample.trim() || undefined,
        })
      });

      if (!response.ok) {
        throw new Error("AI 產生失敗，請稍候重試或自行輸入");
      }

      const data = await response.json();
      setNewTranslation(data.translation || "");
      setNewPos(data.pos || "");
      setNewExample(data.example || "");
      setNewExampleTranslation(data.exampleTranslation || "");
    } catch (err: any) {
      setGenerationError(err.message || "發生錯誤");
    } finally {
      setIsGeneratingCard(false);
    }
  };

  // Add or update word in editing set
  const handleAddCard = () => {
    if (!newWord.trim() || !editingSet) return;

    let updatedCards: Card[];

    if (editingCardId) {
      // Edit mode: find and update card, preserving review status and history
      updatedCards = editingSet.cards.map(card => {
        if (card.id === editingCardId) {
          return {
            ...card,
            word: newWord.trim(),
            translation: newTranslation.trim() || "未填寫翻譯",
            pos: newPos.trim() || "adj.",
            example: newExample.trim(),
            exampleTranslation: newExampleTranslation.trim()
          };
        }
        return card;
      });
      setEditingCardId(null);
    } else {
      // Create mode
      const newCard: Card = {
        id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        word: newWord.trim(),
        translation: newTranslation.trim() || "未填寫翻譯",
        pos: newPos.trim() || "adj.",
        example: newExample.trim(),
        exampleTranslation: newExampleTranslation.trim(),
        status: "learning",
        nextReviewDate: new Date().toISOString().split("T")[0], // Review today!
        intervalDays: 1,
        history: []
      };
      updatedCards = [...editingSet.cards, newCard];
    }

    onUpdateSet(editingSet.id, editingSet.title, editingSet.icon, updatedCards);
    
    // Update local editing state
    setEditingSet({
      ...editingSet,
      cards: updatedCards
    });

    // Reset inputs
    setNewWord("");
    setNewTranslation("");
    setNewPos("");
    setNewExample("");
    setNewExampleTranslation("");
    setGenerationError(null);
  };

  // Delete card from editing set
  const handleDeleteCard = (cardId: string) => {
    if (!editingSet) return;
    const updatedCards = editingSet.cards.filter(c => c.id !== cardId);
    onUpdateSet(editingSet.id, editingSet.title, editingSet.icon, updatedCards);
    setEditingSet({
      ...editingSet,
      cards: updatedCards
    });
  };

  // Handle CSV Import via File Upload
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingSet) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      try {
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          setCsvError("CSV 格式不正確或無有效單字。格式應為: 單字,翻譯,詞性,例句,例句翻譯");
          return;
        }

        // Map parsed CSV items to Card object format
        const newCards: Card[] = parsed.map((item, index) => ({
          id: `card-csv-${Date.now()}-${index}`,
          word: item.word,
          translation: item.translation || "自動產生中...",
          pos: item.pos || "n.",
          example: item.example || "",
          exampleTranslation: item.exampleTranslation || "",
          status: "learning",
          nextReviewDate: new Date().toISOString().split("T")[0],
          intervalDays: 1,
          history: []
        }));

        const updatedCards = [...editingSet.cards, ...newCards];
        onUpdateSet(editingSet.id, editingSet.title, editingSet.icon, updatedCards);
        setEditingSet({
          ...editingSet,
          cards: updatedCards
        });

        setCsvError(null);
        alert(`成功匯入 ${newCards.length} 個單字卡！`);
      } catch (err) {
        setCsvError("讀取 CSV 檔案時發生錯誤");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* SECTION 1: FORGETTING CURVE REVIEW BOARD & STATISTICS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Spaced Repetition Notification / Today's Review Panel */}
        <div className="lg:col-span-5 bg-blue-600 rounded-3xl p-6 flex flex-col justify-between text-white shadow-xl shadow-blue-100 relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/45 rounded-full -mr-12 -mt-12 pointer-events-none" />
          
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-blue-200 animate-pulse" />
              <h2 className="text-xs font-bold text-blue-100 uppercase tracking-wider">遺忘曲線複習提醒</h2>
            </div>

            <h3 className="text-2xl font-bold leading-tight mb-2">
              遺忘曲線提醒
            </h3>
            <p className="text-xs text-blue-100 leading-relaxed mb-6 font-medium">
              根據科學最佳複習間隔，今天共有 <strong className="text-white font-extrabold">{dueCardsCount}</strong> 個單字已到達黃金記憶點。立即複習以強化大腦皮層的突觸連結！
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-5xl font-extrabold tracking-tight">{dueCardsCount}</span>
              <span className="text-xs text-blue-100 font-semibold">張待複習卡片</span>
            </div>

            <button
              disabled={dueCardsCount === 0}
              onClick={onStartTodayReview}
              id="btn-start-today-review"
              className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 border shadow-lg ${
                dueCardsCount > 0
                  ? "bg-white border-white text-blue-600 hover:bg-blue-50 cursor-pointer active:scale-95"
                  : "bg-blue-500/50 border-transparent text-blue-300 cursor-not-allowed"
              }`}
            >
              <Play size={16} fill="currentColor" />
              立即複習 ({dueCardsCount})
            </button>
          </div>
        </div>

        {/* Statistical progress charts */}
        <div className="lg:col-span-7 bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History size={16} className="text-gray-400" />
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">學習進度統計</h2>
            </div>

            {/* Range Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1 text-[10px] font-bold border border-gray-100">
              <button
                onClick={() => setChartRange("3days")}
                className={`px-3 py-1 rounded transition-all ${
                  chartRange === "3days" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                三日
              </button>
              <button
                onClick={() => setChartRange("1week")}
                className={`px-3 py-1 rounded transition-all ${
                  chartRange === "1week" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                一週
              </button>
              <button
                onClick={() => setChartRange("1month")}
                className={`px-3 py-1 rounded transition-all ${
                  chartRange === "1month" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                一月
              </button>
            </div>
          </div>

          {/* Native SVG Bar Chart */}
          <div className="h-40 w-full flex items-end justify-between px-2 pt-4 border-b border-gray-50 relative">
            {filteredProgress.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <Info size={16} className="text-gray-300 mb-1" />
                <p className="text-[10px] text-gray-400 font-medium">目前尚無此區間的複習紀錄</p>
              </div>
            ) : (
              filteredProgress.map((p, idx) => {
                const totalReviewed = p.remembered + p.forgotten;
                const rememberedHeight = totalReviewed > 0 ? (p.remembered / maxProgressValue) * 100 : 0;
                const forgottenHeight = totalReviewed > 0 ? (p.forgotten / maxProgressValue) * 100 : 0;

                // Format simple label (MM/DD or relative)
                const dateLabel = p.date.substring(5); // Show "MM-DD"

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center group h-full justify-end max-w-[48px] mx-1">
                    {/* Floating detail tooltip */}
                    <div className="absolute opacity-0 group-hover:opacity-100 bottom-full bg-gray-800 text-white text-[9px] font-medium px-2 py-1 rounded shadow-md pointer-events-none transition-opacity duration-200 z-10 flex gap-2 mb-2 whitespace-nowrap">
                      <span className="text-blue-300">記得: {p.remembered}</span>
                      <span className="text-blue-100">遺忘: {p.forgotten}</span>
                    </div>

                    {/* Stacked Bar container */}
                    <div className="w-full flex flex-col justify-end items-center h-[120px] bg-gray-50 rounded-t-lg overflow-hidden relative border border-gray-100/50">
                      {/* Forgotten chunk (Light Blue) */}
                      <div 
                        className="w-full bg-blue-200 transition-all duration-300"
                        style={{ height: `${forgottenHeight}%` }}
                      />
                      {/* Remembered chunk (Blue-500) */}
                      <div 
                        className="w-full bg-blue-500 transition-all duration-300"
                        style={{ height: `${rememberedHeight}%` }}
                      />
                    </div>

                    {/* Date label */}
                    <span className="text-[9px] text-gray-400 font-semibold mt-2 truncate max-w-full">
                      {filteredProgress.length > 10 ? (idx % 5 === 0 ? dateLabel : "") : dateLabel}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Simple Legend Indicator */}
          <div className="flex justify-between items-center mt-3 text-[10px] text-gray-400 font-medium">
            <div className="flex gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                記得 (Remembered)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-200" />
                遺忘 (Forgotten)
              </span>
            </div>
            <span>最近紀錄</span>
          </div>
        </div>

      </div>

      {/* SECTION 1.2: GOOGLE SHEETS CLOUD SYNC & ACCOUNT BINDING */}
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-xs relative overflow-hidden">
        {/* Subtle decorative background icon */}
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-5 pointer-events-none">
          <svg className="w-48 h-48 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm1.8 14.2H12V18h-1.6v-1.8H8.2v-1.6h2.2v-2.2H8.2v-1.6h2.2V9H12v1.8h3.8V12H12v2.2h3.8v2z"/>
          </svg>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center border border-emerald-100">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-1 7h-4V5h4v5M12 5v5H8V5h4M8 12h4v7H8v-7m6 7v-7h4v7h-4z"/>
                </svg>
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm tracking-tight">Google Sheets 雲端同步 & 帳號綁定</h3>
              {currentUser ? (
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full border border-emerald-200">
                  已連結
                </span>
              ) : (
                <span className="text-[9px] bg-slate-100 text-slate-500 font-extrabold px-2 py-0.5 rounded-full border border-slate-200">
                  未連結
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              {currentUser
                ? "已成功綁定您的 Google 帳號，一鍵將字卡組與學習歷史同步至雲端試算表。可於試算表中隨時檢視與匯出您的專屬字彙庫！"
                : "綁定您的 Google 帳號，一鍵將字卡與進度歷史同步存入您專屬的 Google 試算表中（將自動於 Google 雲端硬碟建立「NotebookLM 智慧單字學習庫」試算表）。"}
            </p>

            {currentUser && (
              <div className="flex flex-col sm:flex-row gap-x-4 gap-y-2 pt-1.5 text-xs text-slate-600 font-semibold font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400">👤 綁定帳號:</span>
                  <span className="text-slate-800 font-bold">{currentUser.email}</span>
                </div>
                {spreadsheetId && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">📊 雲端試算表 ID:</span>
                    <span className="text-emerald-700 font-bold max-w-[120px] truncate" title={spreadsheetId}>
                      {spreadsheetId}
                    </span>
                  </div>
                )}
                {lastSyncedTime && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">⏰ 上次同步:</span>
                    <span className="text-blue-600 font-bold">{lastSyncedTime}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={onSyncToSheets}
                  disabled={isSyncingSheets}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  <RefreshCw size={14} className={isSyncingSheets ? "animate-spin" : ""} />
                  {isSyncingSheets ? "同步中..." : "立即同步至 Google Sheets"}
                </button>

                {spreadsheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    開啟試算表
                  </a>
                )}

                <button
                  type="button"
                  onClick={onGoogleLogout}
                  className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  解除帳號綁定
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="gsi-material-button scale-95 origin-right"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents text-xs font-bold text-slate-700">綁定 Google 帳號</span>
                </div>
              </button>
            )}
          </div>
        </div>

        {syncError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-semibold flex items-center gap-2">
            <span>⚠️</span>
            <span>{syncError}</span>
          </div>
        )}
      </div>

      {/* SECTION 1.5: DASHBOARD BADGES DISPLAY */}
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="text-amber-500 animate-pulse" size={18} />
            <h3 className="text-sm font-extrabold text-slate-800">成就勳章學習進度</h3>
          </div>
          <button
            type="button"
            onClick={onOpenBadges}
            className="text-xs text-blue-600 hover:text-blue-500 font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
          >
            檢視所有成就勳章
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Recently Unlocked */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-gray-400 font-extrabold uppercase tracking-wider">
              <span>🌟 最近獲得的勳章</span>
              <span className="text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-md font-bold">
                已解鎖 {unlockedBadges.length} 個
              </span>
            </div>
            
            {unlockedBadges.length === 0 ? (
              <div className="bg-gray-50/50 rounded-2xl p-4 text-center border border-dashed border-gray-200/50 flex flex-col items-center justify-center min-h-[90px]">
                <span className="text-xl mb-1">🌱</span>
                <p className="text-[10px] text-gray-400 font-bold">目前尚未解鎖任何勳章，加油！</p>
                <p className="text-[9px] text-gray-400">記單字與做測驗即可獲得各類創意勳章</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {unlockedBadges.slice(0, 2).map(badge => (
                  <div key={badge.id} className="flex items-center gap-3 bg-gradient-to-r from-amber-50/20 to-transparent border border-amber-100/50 p-3 rounded-2xl hover:bg-amber-50/10 transition-colors">
                    <span className="text-2xl bg-amber-50 text-amber-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-xs border border-amber-100 shrink-0">
                      {badge.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-amber-800 truncate">{badge.name}</h4>
                        <span className="text-[7px] bg-amber-100 text-amber-800 font-bold px-1 rounded-sm">已得</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-semibold truncate">條件：{badge.requirementText}</p>
                    </div>
                  </div>
                ))}
                {unlockedBadges.length > 2 && (
                  <p className="text-[9px] text-gray-400 font-bold text-center mt-1">
                    ...以及其他 {unlockedBadges.length - 2} 個已解鎖勳章
                  </p>
                )}
              </div>
            )}
          </div>

          {/* In-Progress (Closest to completion) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-gray-400 font-extrabold uppercase tracking-wider">
              <span>🎯 正在追求的勳章</span>
              <span className="text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md font-bold">
                解鎖度領先
              </span>
            </div>

            {inProgressBadges.length === 0 ? (
              <div className="bg-emerald-50/30 rounded-2xl p-4 text-center border border-dashed border-emerald-250/30 flex flex-col items-center justify-center min-h-[90px]">
                <span className="text-xl mb-1">🏆</span>
                <p className="text-[10px] text-emerald-800 font-bold">恭喜！已解鎖所有的勳章！</p>
                <p className="text-[9px] text-emerald-600">您是當之無愧的終極記憶大師！</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {inProgressBadges.slice(0, 2).map((badge, idx) => {
                  const percent = Math.min((badge.currentValue / badge.requirementValue) * 100, 100);
                  return (
                    <div 
                      key={badge.id} 
                      className="flex items-center gap-3 bg-gray-50/50 border border-gray-150 p-3 rounded-2xl opacity-85 hover:opacity-100 transition-all duration-200"
                    >
                      <span 
                        className="text-2xl w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 shrink-0 transition-all"
                        style={{ 
                          backgroundColor: "#f1f5f9", 
                          filter: "grayscale(40%) saturate(60%) brightness(95%)", 
                          opacity: 0.85 
                        }}
                      >
                        {badge.icon}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-500 truncate">{badge.name}</h4>
                          <span className="text-[9px] text-slate-400 font-extrabold font-mono">
                            {badge.currentValue}/{badge.requirementValue}
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200/70 h-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-blue-400/60 h-full rounded-full transition-all duration-300" 
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {inProgressBadges.length > 2 && (
                  <p className="text-[9px] text-gray-400 font-bold text-center mt-1">
                    ...還有 {inProgressBadges.length - 2} 個在奮鬥中的勳章
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: LIST OF FLASHCARD SETS (HORIZONTAL ROWS) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-gray-400" />
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">我的單字卡庫 ({sets.length})</h2>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            id="btn-create-set"
            className="text-xs font-bold bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-full transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            新增單字卡組
          </button>
        </div>

        {/* Dynamic Tag Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 bg-gray-50/50 p-3 rounded-2xl border border-gray-100/60 shadow-sm animate-fade-in">
          <span className="text-[10px] font-bold text-gray-400 mr-2 flex items-center gap-1 shrink-0">
            <Tag size={12} className="text-blue-500 animate-pulse" />
            分類篩選：
          </span>
          <button
            onClick={() => setSelectedFilterTag(null)}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
              selectedFilterTag === null
                ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
            }`}
          >
            全部 ({sets.length})
          </button>
          {categories.map(tag => {
            const count = sets.filter(s => s.tags && s.tags.includes(tag)).length;
            return (
              <button
                key={tag}
                onClick={() => setSelectedFilterTag(tag)}
                className={`text-xs font-bold px-3.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedFilterTag === tag
                    ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <span>{tag}</span>
                <span className={`text-[10px] px-1.5 py-0.1 rounded-full font-extrabold ${
                  selectedFilterTag === tag ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-400"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
          {/* Also show any tags that are actively on sets but not in categories */}
          {availableTags.filter(t => !categories.includes(t)).map(tag => {
            const count = sets.filter(s => s.tags && s.tags.includes(tag)).length;
            return (
              <button
                key={tag}
                onClick={() => setSelectedFilterTag(tag)}
                className={`text-xs font-bold px-3.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedFilterTag === tag
                    ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <span>{tag}</span>
                <span className={`text-[10px] px-1.5 py-0.1 rounded-full font-extrabold ${
                  selectedFilterTag === tag ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-400"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setIsManageCategoriesModalOpen(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 flex items-center gap-1.5 transition-all shadow-xs ml-auto cursor-pointer font-sans"
            title="編輯/管理分類標題"
          >
            <Edit3 size={12} className="text-slate-500" />
            <span>管理分類</span>
          </button>
        </div>

        {/* Sets horizontal layout */}
        <div className="space-y-4" id="flashcard-sets-list">
          {sets.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-3xl p-10 text-center flex flex-col items-center shadow-sm">
              <BookOpen size={36} className="text-gray-300 mb-3" />
              <p className="text-sm font-bold text-gray-600">目前尚無單字卡組</p>
              <p className="text-xs text-gray-400 mt-1">點擊上方「新增單字卡組」按鈕，建立你的第一個卡組吧！</p>
            </div>
          ) : filteredSets.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-3xl p-10 text-center flex flex-col items-center shadow-sm animate-fade-in">
              <Tag size={36} className="text-gray-300 mb-3" />
              <p className="text-sm font-bold text-gray-600">此標籤下無任何單字卡組</p>
              <p className="text-xs text-gray-400 mt-1">
                您可以點擊其他分類標籤，或者編輯現有卡組，在「本字卡組標籤管理」中新增這個標籤分類！
              </p>
            </div>
          ) : (
            filteredSets.map(set => {
              const isExpanded = expandedSetId === set.id;
              const forgottenCountInSet = set.cards.filter(c => c.status === "forgotten").length;
              
              return (
                <div 
                  key={set.id}
                  id={`set-row-${set.id}`}
                  className="bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-md transition-all overflow-hidden"
                >
                  {/* Row Header Clickable */}
                  <div 
                    onClick={() => setExpandedSetId(isExpanded ? null : set.id)}
                    className="px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Customize emoji represent symbol */}
                      <span className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center text-2xl border border-blue-100/30">
                        {set.icon}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-gray-800 text-base leading-snug">{set.title}</h3>
                          {set.tags && set.tags.map(tag => (
                            <span 
                              key={tag} 
                              className="text-[9px] bg-blue-50 text-blue-600 border border-blue-100/50 px-2 py-0.5 rounded-full font-bold shadow-sm"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 font-medium mt-1">
                          建立於 {set.createdAt} • 有過 {forgottenCountInSet} 個遺忘單詞
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Word Count */}
                      <span className="text-xs font-bold text-gray-400 mr-4">
                        {set.cards.length} 張卡片
                      </span>
                      
                      <ChevronDown 
                        size={16} 
                        className={`text-gray-400 transition-transform ${isExpanded ? "transform rotate-180" : ""}`} 
                      />
                    </div>
                  </div>

                  {/* Options Expansion Section */}
                  {isExpanded && (
                    <div className="border-t border-gray-50 bg-gray-50/50 p-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                      <div className="flex flex-wrap gap-2">
                        {/* Option 1: Review Forgotten (Red-themed) */}
                        <button
                          onClick={() => onStartReview(set, "forgotten")}
                          disabled={forgottenCountInSet === 0}
                          id={`btn-review-forgotten-${set.id}`}
                          className={`px-4 py-2 border text-xs font-bold rounded-full transition-all ${
                            forgottenCountInSet > 0
                              ? "border-red-200 text-red-500 bg-white hover:bg-red-50 cursor-pointer shadow-sm"
                              : "border-gray-200 text-gray-300 bg-white cursor-not-allowed"
                          }`}
                        >
                          複習遺忘 ({forgottenCountInSet})
                        </button>

                        {/* Option 2: Review All */}
                        <button
                          onClick={() => onStartReview(set, "all")}
                          disabled={set.cards.length === 0}
                          id={`btn-review-all-${set.id}`}
                          className={`px-4 py-2 text-xs font-bold rounded-full transition-all ${
                            set.cards.length > 0
                              ? "bg-gray-800 hover:bg-gray-700 text-white cursor-pointer shadow-sm"
                              : "bg-gray-100 border border-gray-200 text-gray-300 cursor-not-allowed"
                          }`}
                        >
                          複習全部
                        </button>

                        {/* Option 3: NotebookLM Workspace */}
                        <button
                          onClick={() => onOpenNotebook(set)}
                          id={`btn-notebook-${set.id}`}
                          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 text-xs font-bold rounded-full cursor-pointer shadow-md shadow-indigo-100 flex items-center gap-1.5 transition-all hover:scale-105"
                        >
                          <Sparkles size={12} className="animate-pulse" />
                          開啟智慧統整
                        </button>

                        {/* Option 4: AI Quiz Generation */}
                        <button
                          onClick={() => onOpenQuiz(set)}
                          id={`btn-quiz-${set.id}`}
                          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 text-xs font-bold rounded-full cursor-pointer shadow-md shadow-pink-100 flex items-center gap-1.5 transition-all hover:scale-105"
                        >
                          <HelpCircle size={12} />
                          AI 測驗生成
                        </button>
                      </div>

                      {/* Editing / Management buttons */}
                      <div className="flex items-center gap-2">
                        {deletingSetId === set.id ? (
                          <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl animate-fade-in shrink-0">
                            <span className="text-[11px] font-bold text-red-600">確定刪除此卡組嗎？</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSet(set.id);
                                setDeletingSetId(null);
                              }}
                              className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[10px] font-extrabold cursor-pointer transition-colors shadow-sm"
                            >
                              確定
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingSetId(null);
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-500 border border-gray-200 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleOpenEditSet(set)}
                              id={`btn-manage-cards-${set.id}`}
                              className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <Edit3 size={12} />
                              編輯 & 管理字卡
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingSetId(set.id);
                              }}
                              id={`btn-delete-set-${set.id}`}
                              className="p-2.5 rounded-xl bg-white border border-red-100 hover:bg-red-50 text-red-500 hover:text-red-600 cursor-pointer shadow-sm"
                              title="刪除卡組"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CREATE SET MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg border border-gray-100 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-gray-800 text-lg">建立全新單字卡組</h3>
              <button 
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreateMode("manual");
                  setAiParsedResult(null);
                }} 
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Dual Mode Tab Selector */}
            <div className="flex border-b border-gray-150 mb-6">
              <button
                type="button"
                onClick={() => {
                  setCreateMode("manual");
                  setAiParsedResult(null);
                  setAiParseError(null);
                }}
                className={`flex-1 pb-3 text-xs font-extrabold border-b-2 transition-colors cursor-pointer ${
                  createMode === "manual"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                ✍️ 手動建立
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateMode("ai");
                  setAiParsedResult(null);
                  setAiParseError(null);
                }}
                className={`flex-1 pb-3 text-xs font-extrabold border-b-2 transition-colors cursor-pointer ${
                  createMode === "ai"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                🧠 AI 智慧解析建立 (檔案/照片/網址)
              </button>
            </div>

            <form onSubmit={handleCreateSetSubmit} className="space-y-4">
              {/* MANUAL MODE FORM */}
              {createMode === "manual" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      單字組標題
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="例如: 托福字彙必勝組、多益商務..."
                      value={newSetTitle}
                      onChange={e => setNewSetTitle(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      自訂代表圖式 (Emoji)
                    </label>
                    <div className="grid grid-cols-5 gap-2 mb-3">
                      {EMOJIS.map(emoji => (
                        <button
                          type="button"
                          key={emoji}
                          onClick={() => setNewSetIcon(emoji)}
                          className={`text-xl p-2 rounded-2xl border transition-all cursor-pointer ${
                            newSetIcon === emoji 
                              ? "bg-blue-50 border-blue-500 scale-105" 
                              : "bg-white border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="或者直接在此輸入表情符號"
                      value={newSetIcon}
                      maxLength={4}
                      onChange={e => setNewSetIcon(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:border-blue-500 text-center"
                    />
                  </div>
                </div>
              )}

              {/* AI INTEGRATED IMPORT MODE */}
              {createMode === "ai" && (
                <div className="space-y-4 animate-fade-in">
                  {/* AI Source Type Tabs */}
                  <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-bold text-gray-500">
                    <button
                      type="button"
                      onClick={() => { setAiSourceType("text"); setAiParseError(null); }}
                      className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${aiSourceType === "text" ? "bg-white text-blue-600 shadow-sm" : "hover:text-gray-800"}`}
                    >
                      <FileText size={12} />
                      檔案/文字
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAiSourceType("image"); setAiParseError(null); }}
                      className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${aiSourceType === "image" ? "bg-white text-blue-600 shadow-sm" : "hover:text-gray-800"}`}
                    >
                      <ImageIcon size={12} />
                      照片/圖片
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAiSourceType("url"); setAiParseError(null); }}
                      className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${aiSourceType === "url" ? "bg-white text-blue-600 shadow-sm" : "hover:text-gray-800"}`}
                    >
                      <LinkIcon size={12} />
                      網頁網址
                    </button>
                  </div>

                  {/* AI Word Count Selection / Extraction Completeness Option */}
                  <div className="bg-purple-50/30 p-3 rounded-2xl border border-purple-100/30 space-y-2">
                    <label className="block text-[10px] font-extrabold text-purple-700 uppercase tracking-wider">
                      🎯 AI 單字擷取細緻度 (自動調整擷取比例)
                    </label>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-gray-100 rounded-xl text-[10px] font-bold text-gray-500">
                      <button
                        type="button"
                        onClick={() => setAiDetailLevel("low")}
                        className={`py-1.5 rounded-lg flex items-center justify-center gap-0.5 transition-all cursor-pointer ${aiDetailLevel === "low" ? "bg-white text-purple-700 shadow-sm" : "hover:text-gray-800"}`}
                      >
                        ⚡ 概括 (低比例)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiDetailLevel("medium")}
                        className={`py-1.5 rounded-lg flex items-center justify-center gap-0.5 transition-all cursor-pointer ${aiDetailLevel === "medium" ? "bg-white text-purple-700 shadow-sm" : "hover:text-gray-800"}`}
                      >
                        📊 標準 (中比例)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiDetailLevel("high")}
                        className={`py-1.5 rounded-lg flex items-center justify-center gap-0.5 transition-all cursor-pointer ${aiDetailLevel === "high" ? "bg-white text-purple-700 shadow-sm" : "hover:text-gray-800"}`}
                      >
                        🔥 詳細 (高比例)
                      </button>
                    </div>
                  </div>

                  {/* Mode-specific Fields */}
                  {aiSourceType === "text" && (
                    <div className="space-y-2 animate-fade-in">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                        輸入英文文章或貼上內文
                      </label>
                      <textarea
                        rows={4}
                        placeholder="請在此處貼上您想要閱讀並擷取單字的文章、新聞或筆記..."
                        value={aiInputText}
                        onChange={e => setAiInputText(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400 font-bold">或匯入文字檔案 (.txt, .md)：</span>
                        <input
                          type="file"
                          ref={textFileInputRef}
                          accept=".txt,.md"
                          onChange={handleTextFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => textFileInputRef.current?.click()}
                          className="text-[10px] bg-white border border-gray-200 hover:bg-gray-50 text-blue-600 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <Upload size={10} />
                          選取檔案
                        </button>
                      </div>
                    </div>
                  )}

                  {aiSourceType === "image" && (
                    <div className="space-y-2 animate-fade-in">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                        上傳講義、書籍或手寫筆記照片 (AI 智慧辨識 OCR，上限 10 張)
                      </label>
                      <input
                        type="file"
                        ref={imageFileInputRef}
                        accept="image/*"
                        multiple
                        onChange={handleImageChange}
                        className="hidden"
                      />
                      <div 
                        onClick={() => imageFileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 cursor-pointer hover:border-blue-400 transition-all text-center"
                      >
                        <ImageIcon size={28} className="text-gray-400 mb-2" />
                        <p className="text-xs text-gray-600 font-bold">點擊上傳或拍照 (支援一次選擇多張)</p>
                        <p className="text-[10px] text-gray-400 mt-1">支援 PNG, JPG, WEBP 等格式，上限 10 張</p>
                      </div>

                      {aiInputImages.length > 0 && (
                        <div className="mt-3 space-y-2 animate-fade-in">
                          <p className="text-[11px] font-bold text-gray-500">
                            已選取照片 ({aiInputImages.length}/10)：
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-gray-100 rounded-xl bg-gray-50/30">
                            {aiInputImages.map((img, idx) => (
                              <div 
                                key={idx} 
                                className="flex items-center justify-between bg-white border border-gray-150 text-slate-700 text-[10px] px-3 py-2 rounded-xl font-bold shadow-xs min-w-0"
                              >
                                <span className="truncate flex-1 mr-1">{img.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated = aiInputImages.filter((_, i) => i !== idx);
                                    setAiInputImages(updated);
                                    if (updated.length > 0) {
                                      setAiInputImage(updated[0].base64);
                                      setAiInputImageName(updated[0].name);
                                    } else {
                                      setAiInputImage(null);
                                      setAiInputImageName("");
                                    }
                                  }}
                                  className="text-gray-400 hover:text-red-500 transition-colors shrink-0 cursor-pointer"
                                  title="移除此圖片"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {aiSourceType === "url" && (
                    <div className="space-y-2 animate-fade-in">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                        貼上外部英文網址 (部落格、新聞、學習網)
                      </label>
                      <input
                        type="url"
                        placeholder="e.g. https://www.bbc.com/news/world-..."
                        value={aiInputUrl}
                        onChange={e => setAiInputUrl(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                      />
                      <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                        * AI 將自動抓取該網址的文章主體，並挑選合適的生字製作成完整字卡組。
                      </p>
                    </div>
                  )}

                  {aiParseError && (
                    <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-[11px] text-rose-500 font-bold flex items-center gap-1.5 animate-fade-in">
                      <AlertCircle size={12} className="shrink-0" />
                      <span>{aiParseError}</span>
                    </div>
                  )}

                  {/* Submit parser button */}
                  {!aiParsedResult && (
                    <button
                      type="button"
                      disabled={isAiParsing}
                      onClick={handleAiParse}
                      id="btn-ai-parse-start"
                      className={`w-full py-3 rounded-full text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 ${
                        isAiParsing
                          ? "bg-purple-100 text-purple-400 cursor-not-allowed"
                          : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-purple-100"
                      }`}
                    >
                      {isAiParsing ? (
                        <>
                          <Loader2 className="animate-spin" size={14} />
                          AI 正在辨識並解析生字中...請稍候
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          開始 AI 智慧解析與生字彙整
                        </>
                      )}
                    </button>
                  )}

                  {/* AI Parsed Results Preview */}
                  {aiParsedResult && (
                    <div className="border border-purple-100 rounded-2xl p-4 bg-purple-50/20 space-y-3 animate-fade-in">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                          <Check size={10} />
                          AI 彙整成功
                        </span>
                        <span className="text-xs text-gray-500 font-bold">已自動抓取 {aiParsedResult.cards?.length || 0} 個核心字詞</span>
                      </div>

                      {/* Customize Set Info */}
                      <div className="grid grid-cols-4 gap-2">
                        <div className="col-span-3">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                            卡組標題 (可微調)
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="請輸入卡組標題"
                            value={newSetTitle}
                            onChange={e => setNewSetTitle(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                            代表 Emoji
                          </label>
                          <input
                            type="text"
                            placeholder="圖示"
                            value={newSetIcon}
                            maxLength={2}
                            onChange={e => setNewSetIcon(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-center focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* Preview of cards */}
                      <div className="max-h-32 overflow-y-auto border border-gray-150 rounded-xl bg-white p-2 divide-y divide-gray-100 shadow-inner">
                        {aiParsedResult.cards?.map((card: any, index: number) => (
                          <div key={index} className="py-2 px-1 flex items-center justify-between text-xs">
                            <span className="font-bold text-gray-800 font-mono">{card.word}</span>
                            <span className="text-gray-400 font-semibold text-[10px] bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{card.pos}</span>
                            <span className="text-gray-500 font-medium max-w-[150px] truncate">{card.translation}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Unified Tag Selection Section */}
              <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100/60 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <Tag size={13} className="text-blue-500" />
                  <span>設定標籤分類</span>
                </div>

                {/* Selected Tags Display */}
                <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                  {newSetTags.length === 0 ? (
                    <span className="text-[10px] text-gray-400 font-medium">尚未添加任何標籤。您可從下方選擇或自訂輸入。</span>
                  ) : (
                    newSetTags.map(tag => (
                      <span 
                        key={tag}
                        className="text-[10px] bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-extrabold flex items-center gap-1 border border-blue-200/20 shadow-sm"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setNewSetTags(newSetTags.filter(t => t !== tag))}
                          className="hover:bg-blue-200 rounded-full p-0.5 text-blue-500 hover:text-blue-700 font-bold transition-all"
                        >
                          <X size={8} />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Recommended Tags Quick Selection */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-400 font-sans">分類快速選擇：</p>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map(tag => {
                      const isSelected = newSetTags.includes(tag);
                      return (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => {
                            if (isSelected) {
                              setNewSetTags(newSetTags.filter(t => t !== tag));
                            } else {
                              setNewSetTags([...newSetTags, tag]);
                            }
                          }}
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer font-sans ${
                            isSelected
                              ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                              : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Tag Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="新增自訂標籤 (例如: 托福、初級)"
                    value={customTagInput}
                    onChange={e => setCustomTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const tag = customTagInput.trim();
                        if (tag && !newSetTags.includes(tag)) {
                          setNewSetTags([...newSetTags, tag]);
                          setCustomTagInput("");
                        }
                      }
                    }}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const tag = customTagInput.trim();
                      if (tag && !newSetTags.includes(tag)) {
                        setNewSetTags([...newSetTags, tag]);
                        setCustomTagInput("");
                      }
                    }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all cursor-pointer text-xs font-bold shrink-0"
                  >
                    新增
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setCreateMode("manual");
                    setAiParsedResult(null);
                  }}
                  className="flex-1 py-3 rounded-full border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-600 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={createMode === "ai" && !aiParsedResult}
                  id="btn-confirm-create-set"
                  className={`flex-1 py-3 rounded-full text-xs font-bold shadow-lg transition-all ${
                    createMode === "ai" && !aiParsedResult
                      ? "bg-gray-100 text-gray-300 shadow-none cursor-not-allowed border border-gray-200"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-100 cursor-pointer"
                  }`}
                >
                  確認建立
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SET / CARD MANAGEMENT MODAL */}
      {isEditModalOpen && editingSet && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl border border-gray-100 shadow-2xl my-8 flex flex-col max-h-[85vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white rounded-t-3xl">
              <div className="flex items-center gap-3">
                <span className="text-2xl w-12 h-12 bg-blue-50 rounded-2xl border border-blue-100/20 flex items-center justify-center">{editingSet.icon}</span>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg leading-tight">管理字卡 - {editingSet.title}</h3>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">可以新增、刪除單字，或直接匯入 CSV 檔案</p>
                </div>
              </div>
              <button
                onClick={handleCloseEditModal}
                className="p-2.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Container */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 bg-gray-50/50">
              
              {/* Left Column: Form to Create/Add single Card */}
              <div className="lg:col-span-5 bg-white border border-gray-100 rounded-2xl p-5 h-fit space-y-4 shadow-sm">
                <h4 className="font-bold text-gray-700 text-sm flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="flex items-center gap-1.5">
                    {editingCardId ? <Edit3 size={16} className="text-blue-500" /> : <Plus size={16} />}
                    {editingCardId ? "修改單字卡" : "手動新增單字卡"}
                  </span>
                  {editingCardId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCardId(null);
                        setNewWord("");
                        setNewTranslation("");
                        setNewPos("");
                        setNewExample("");
                        setNewExampleTranslation("");
                        setGenerationError(null);
                      }}
                      className="text-[10px] text-gray-400 hover:text-gray-600 font-bold bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                    >
                      取消修改
                    </button>
                  )}
                </h4>

                {/* Word */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    單字 (Word)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. innovate"
                      value={newWord}
                      onChange={e => setNewWord(e.target.value)}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 font-mono"
                    />
                    <button
                      type="button"
                      disabled={!newWord.trim() || isGeneratingCard}
                      onClick={handleAutoGenerateDetails}
                      id="btn-ai-generate-card"
                      title="AI 自動生成翻譯與例句"
                      className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center justify-center transition-all ${
                        newWord.trim() && !isGeneratingCard
                          ? "bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200/50 cursor-pointer"
                          : "bg-gray-100 text-gray-300 border border-gray-200/20 cursor-not-allowed"
                      }`}
                    >
                      {isGeneratingCard ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                    </button>
                  </div>
                </div>

                {generationError && (
                  <p className="text-[10px] text-rose-500 font-medium bg-rose-50/80 p-2 border border-rose-100 rounded-lg">
                    {generationError}
                  </p>
                )}

                {/* Translation & POS */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      中文翻譯 (Translation)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 創新"
                      value={newTranslation}
                      onChange={e => setNewTranslation(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      詞性 (POS)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. v."
                      value={newPos}
                      onChange={e => setNewPos(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {/* Example Sentence */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    英文例句 (Example Sentence)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. We must innovate to stay competitive."
                    value={newExample}
                    onChange={e => setNewExample(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 font-mono"
                  />
                </div>

                {/* Example Translation */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    例句翻譯 (Example Translation)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. 我們必須創新才能保持競爭力。"
                    value={newExampleTranslation}
                    onChange={e => setNewExampleTranslation(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                  />
                </div>

                <button
                  type="button"
                  disabled={!newWord.trim()}
                  onClick={handleAddCard}
                  id="btn-add-card-to-set"
                  className={`w-full py-2.5 rounded-full text-xs font-bold transition-all shadow-md ${
                    newWord.trim()
                      ? editingCardId
                        ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-blue-100"
                        : "bg-gray-800 hover:bg-gray-700 text-white cursor-pointer"
                      : "bg-gray-100 text-gray-300 border border-gray-200/20 cursor-not-allowed"
                  }`}
                >
                  {editingCardId ? "更新此單字卡" : "新增此單字卡"}
                </button>

                {/* SET TAGS MANAGEMENT BOARD */}
                <div className="border-t border-gray-100 pt-4 mt-6 space-y-3">
                  <h4 className="font-bold text-gray-700 text-sm flex items-center gap-1.5 pb-2 border-b border-gray-100">
                    <Tag size={14} className="text-blue-500" />
                    本字卡組標籤管理
                  </h4>
                  <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                    您可以點擊下方推薦標籤，或手動輸入新標籤來分類此單字組。
                  </p>

                  {/* Active Tags */}
                  <div className="flex flex-wrap gap-1.5 min-h-[20px]">
                    {(!editingSet.tags || editingSet.tags.length === 0) ? (
                      <span className="text-[10px] text-gray-400 italic">目前尚未設定任何標籤分類</span>
                    ) : (
                      editingSet.tags.map(tag => (
                        <span 
                          key={tag}
                          className="text-[10px] bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-extrabold flex items-center gap-1 border border-blue-200/20 shadow-sm"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => {
                              const updatedTags = (editingSet.tags || []).filter(t => t !== tag);
                              onUpdateSet(editingSet.id, editingSet.title, editingSet.icon, editingSet.cards, { tags: updatedTags });
                              setEditingSet({ ...editingSet, tags: updatedTags });
                            }}
                            className="hover:bg-blue-200 rounded-full p-0.5 text-blue-500 hover:text-blue-700 font-bold transition-all cursor-pointer animate-fade-in"
                          >
                            <X size={8} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {/* Recommendation Grid */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400">現有分類快速選擇：</p>
                    <div className="flex flex-wrap gap-1">
                      {categories.map(tag => {
                        const isSelected = (editingSet.tags || []).includes(tag);
                        return (
                          <button
                            type="button"
                            key={tag}
                            onClick={() => {
                              const currentTags = editingSet.tags || [];
                              const updatedTags = isSelected 
                                ? currentTags.filter(t => t !== tag) 
                                : [...currentTags, tag];
                              onUpdateSet(editingSet.id, editingSet.title, editingSet.icon, editingSet.cards, { tags: updatedTags });
                              setEditingSet({ ...editingSet, tags: updatedTags });
                            }}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Tag Row */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      id="input-add-tag-edit"
                      placeholder="新增自訂標籤..."
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const input = (e.target as HTMLInputElement);
                          const tag = input.value.trim();
                          if (tag && !(editingSet.tags || []).includes(tag)) {
                            const updatedTags = [...(editingSet.tags || []), tag];
                            onUpdateSet(editingSet.id, editingSet.title, editingSet.icon, editingSet.cards, { tags: updatedTags });
                            setEditingSet({ ...editingSet, tags: updatedTags });
                            input.value = "";
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const inputEl = document.getElementById("input-add-tag-edit") as HTMLInputElement;
                        const tag = inputEl?.value.trim();
                        if (tag && !(editingSet.tags || []).includes(tag)) {
                          const updatedTags = [...(editingSet.tags || []), tag];
                          onUpdateSet(editingSet.id, editingSet.title, editingSet.icon, editingSet.cards, { tags: updatedTags });
                          setEditingSet({ ...editingSet, tags: updatedTags });
                          inputEl.value = "";
                        }
                      }}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all cursor-pointer text-xs font-bold"
                    >
                      新增
                    </button>
                  </div>
                </div>

                {/* CSV IMPORT BOARD */}
                <div className="border-t border-gray-100 pt-4 mt-6">
                  <h4 className="font-bold text-gray-700 text-sm flex items-center gap-1.5 pb-2 border-b border-gray-100 mb-3">
                    <Upload size={14} />
                    匯入 CSV 檔案
                  </h4>
                  <p className="text-[10px] text-gray-400 font-medium mb-3 leading-relaxed">
                    上傳一個 CSV 檔案，可同時載入大量單字。格式請以逗號區分: <br />
                    <code className="bg-gray-100 p-1 rounded font-mono text-[9px] text-gray-500">單字,翻譯,詞性,例句,例句翻譯</code>
                  </p>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    id="btn-trigger-csv-file"
                    className="w-full py-2.5 border border-dashed border-gray-300 hover:bg-gray-50 rounded-xl text-gray-600 hover:text-gray-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Upload size={14} />
                    選擇 CSV 檔案並匯入
                  </button>

                  {csvError && (
                    <p className="text-[10px] text-rose-500 font-medium bg-rose-50/80 p-2 border border-rose-100 rounded-lg mt-2">
                      {csvError}
                    </p>
                  )}
                </div>

                {/* AI IMPORT SECTION */}
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <h4 className="font-bold text-gray-700 text-sm flex items-center gap-1.5 pb-2 border-b border-gray-100 mb-3">
                    <Sparkles size={14} className="text-purple-600" />
                    AI 智慧批次解析匯入
                  </h4>
                  <p className="text-[10px] text-gray-400 font-medium mb-3 leading-relaxed">
                    提供文章、手寫筆記照片或新聞連結，讓 AI 自動解析生字並直接擴充到這個卡組中。
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setEditModalAiOpen(!editModalAiOpen);
                      setAiParsedResult(null);
                      setAiParseError(null);
                    }}
                    className="w-full py-2.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl text-purple-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Sparkles size={14} />
                    {editModalAiOpen ? "收起 AI 智慧解析" : "開啟 AI 智慧解析面板"}
                  </button>

                  {editModalAiOpen && (
                    <div className="mt-4 p-4 border border-purple-150 rounded-2xl bg-purple-50/5 space-y-4 animate-fade-in">
                      {/* AI Source Type Selector */}
                      <div className="grid grid-cols-3 gap-1 p-0.5 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">
                        <button
                          type="button"
                          onClick={() => { setAiSourceType("text"); setAiParseError(null); }}
                          className={`py-1 rounded flex items-center justify-center gap-0.5 cursor-pointer transition-all ${aiSourceType === "text" ? "bg-white text-blue-600 shadow-sm" : ""}`}
                        >
                          <FileText size={10} />
                          檔案/文字
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAiSourceType("image"); setAiParseError(null); }}
                          className={`py-1 rounded flex items-center justify-center gap-0.5 cursor-pointer transition-all ${aiSourceType === "image" ? "bg-white text-blue-600 shadow-sm" : ""}`}
                        >
                          <ImageIcon size={10} />
                          照片/圖片
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAiSourceType("url"); setAiParseError(null); }}
                          className={`py-1 rounded flex items-center justify-center gap-0.5 cursor-pointer transition-all ${aiSourceType === "url" ? "bg-white text-blue-600 shadow-sm" : ""}`}
                        >
                          <LinkIcon size={10} />
                          網頁網址
                        </button>
                      </div>

                      {/* AI Word Count Selection / Extraction Completeness Option */}
                      <div className="bg-purple-50/30 p-2.5 rounded-xl border border-purple-100/30 space-y-1.5">
                        <label className="block text-[9px] font-extrabold text-purple-700 uppercase tracking-wider">
                          🎯 AI 單字擷取細緻度 (自動調整擷取比例)
                        </label>
                        <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-gray-100 rounded-lg text-[9px] font-bold text-gray-500">
                          <button
                            type="button"
                            onClick={() => setAiDetailLevel("low")}
                            className={`py-1 rounded flex items-center justify-center gap-0.5 transition-all cursor-pointer ${aiDetailLevel === "low" ? "bg-white text-purple-700 shadow-sm" : "hover:text-gray-800"}`}
                          >
                            概括 (低比例)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAiDetailLevel("medium")}
                            className={`py-1 rounded flex items-center justify-center gap-0.5 transition-all cursor-pointer ${aiDetailLevel === "medium" ? "bg-white text-purple-700 shadow-sm" : "hover:text-gray-800"}`}
                          >
                            標準 (中比例)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAiDetailLevel("high")}
                            className={`py-1 rounded flex items-center justify-center gap-0.5 transition-all cursor-pointer ${aiDetailLevel === "high" ? "bg-white text-purple-700 shadow-sm" : "hover:text-gray-800"}`}
                          >
                            詳細 (高比例)
                          </button>
                        </div>
                      </div>

                      {/* Source details input fields */}
                      {aiSourceType === "text" && (
                        <div className="space-y-1.5">
                          <textarea
                            rows={3}
                            placeholder="貼上想要擷取單字的英文內容..."
                            value={aiInputText}
                            onChange={e => setAiInputText(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-mono"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-gray-400">匯入檔案 (.txt, .md)：</span>
                            <input
                              type="file"
                              ref={textFileInputRef}
                              accept=".txt,.md"
                              onChange={handleTextFileChange}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => textFileInputRef.current?.click()}
                              className="text-[9px] text-blue-600 font-bold hover:underline cursor-pointer"
                            >
                              選取檔案
                            </button>
                          </div>
                        </div>
                      )}

                      {aiSourceType === "image" && (
                        <div className="space-y-1.5">
                          <input
                            type="file"
                            ref={imageFileInputRef}
                            accept="image/*"
                            multiple
                            onChange={handleImageChange}
                            className="hidden"
                          />
                          <div 
                            onClick={() => imageFileInputRef.current?.click()}
                            className="border border-dashed border-purple-200 rounded-xl p-4 flex flex-col items-center justify-center bg-white cursor-pointer hover:bg-purple-50/20 transition-all text-center"
                          >
                            <ImageIcon size={20} className="text-purple-400 mb-1" />
                            <p className="text-[10px] text-gray-600 font-bold">點擊上傳或拍攝照片</p>
                          </div>

                          {aiInputImages.length > 0 && (
                            <div className="space-y-1 animate-fade-in">
                              <p className="text-[9px] font-bold text-gray-500">
                                已選取照片 ({aiInputImages.length}/10)：
                              </p>
                              <div className="max-h-24 overflow-y-auto space-y-1 p-1 border border-gray-100 rounded-lg bg-gray-50/50">
                                {aiInputImages.map((img, idx) => (
                                  <div 
                                    key={idx} 
                                    className="flex items-center justify-between bg-white border border-gray-150 text-slate-700 text-[9px] px-2 py-1 rounded-md font-bold shadow-xs min-w-0"
                                  >
                                    <span className="truncate flex-1 mr-1">{img.name}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const updated = aiInputImages.filter((_, i) => i !== idx);
                                        setAiInputImages(updated);
                                        if (updated.length > 0) {
                                          setAiInputImage(updated[0].base64);
                                          setAiInputImageName(updated[0].name);
                                        } else {
                                          setAiInputImage(null);
                                          setAiInputImageName("");
                                        }
                                      }}
                                      className="text-gray-400 hover:text-red-500 transition-colors shrink-0 cursor-pointer"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {aiSourceType === "url" && (
                        <div className="space-y-1.5">
                          <input
                            type="url"
                            placeholder="貼上英文新聞或部落格網址..."
                            value={aiInputUrl}
                            onChange={e => setAiInputUrl(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      )}

                      {aiParseError && (
                        <div className="text-[10px] text-rose-500 font-bold">
                          ⚠️ {aiParseError}
                        </div>
                      )}

                      {/* Execute AI Parser */}
                      {!aiParsedResult ? (
                        <button
                          type="button"
                          disabled={isAiParsing}
                          onClick={handleAiParse}
                          className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {isAiParsing ? (
                            <>
                              <Loader2 className="animate-spin" size={12} />
                              解析中...
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} />
                              開始解析生字
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-[10px] text-purple-700 font-bold flex items-center justify-between">
                            <span>✅ AI 擷取到 {aiParsedResult.cards?.length || 0} 個生字</span>
                            <button
                              type="button"
                              onClick={() => setAiParsedResult(null)}
                              className="text-gray-400 hover:text-gray-600 font-bold"
                            >
                              重新解析
                            </button>
                          </div>
                          
                          {/* Mini micro preview list */}
                          <div className="max-h-24 overflow-y-auto border border-gray-100 bg-white rounded-lg p-1.5 divide-y divide-gray-50 text-[10px]">
                            {aiParsedResult.cards?.map((card: any, idx: number) => (
                              <div key={idx} className="py-1 flex justify-between">
                                <span className="font-bold text-gray-700 font-mono">{card.word}</span>
                                <span className="text-gray-500 truncate max-w-[120px]">{card.translation}</span>
                              </div>
                            ))}
                          </div>

                          {/* Trigger addition */}
                          <button
                            type="button"
                            onClick={() => {
                              const newCardsToAppend = mapAiResultToCards(aiParsedResult.cards);
                              const updatedCards = [...editingSet.cards, ...newCardsToAppend];
                              onUpdateSet(editingSet.id, editingSet.title, editingSet.icon, updatedCards);
                              setEditingSet({ ...editingSet, cards: updatedCards });
                              
                              // Reset state
                              setAiParsedResult(null);
                              setEditModalAiOpen(false);
                            }}
                            className="w-full py-2 bg-green-600 hover:bg-green-500 text-white text-[11px] font-bold rounded-lg shadow-sm cursor-pointer transition-colors"
                          >
                            ➕ 確認擴充到目前字卡組
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: List of Current Cards inside the set */}
              <div className="lg:col-span-7 flex flex-col min-h-[300px]">
                <h4 className="font-bold text-gray-700 text-sm pb-2 border-b border-gray-100 mb-3 flex justify-between items-center">
                  <span>單字卡列表 ({editingSet.cards.length})</span>
                  <span className="text-[10px] font-bold text-gray-400">目前卡片</span>
                </h4>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[50vh]">
                  {editingSet.cards.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center py-12 text-gray-400 text-center">
                      <BookOpen size={24} className="text-gray-300 mb-2" />
                      <p className="text-xs font-semibold">此卡組目前無任何字卡</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">可以在左側新增或匯入 CSV 檔案</p>
                    </div>
                  ) : (
                    editingSet.cards.map(card => (
                      <div 
                        key={card.id}
                        className="p-4 bg-white border border-gray-100 rounded-2xl hover:border-gray-200 hover:shadow-sm transition-all flex items-start justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-gray-800 text-sm">{card.word}</span>
                            <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-bold">{card.pos}</span>
                            {card.status === "forgotten" && (
                              <span className="text-[9px] bg-red-50 text-red-500 border border-red-100 px-1.5 py-0.5 rounded font-bold">遺忘</span>
                            )}
                            {card.status === "remembered" && (
                              <span className="text-[9px] bg-blue-50 text-blue-500 border border-blue-100 px-1.5 py-0.5 rounded font-bold">記得</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{card.translation}</p>
                          {card.example && (
                            <p className="text-[10px] text-gray-400 italic mt-1 font-mono truncate max-w-[280px] sm:max-w-[400px]">
                              "{card.example}"
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setEditingCardId(card.id);
                              setNewWord(card.word);
                              setNewTranslation(card.translation);
                              setNewPos(card.pos);
                              setNewExample(card.example || "");
                              setNewExampleTranslation(card.exampleTranslation || "");
                              setGenerationError(null);
                            }}
                            id={`btn-edit-card-${card.id}`}
                            title="修改此單字卡"
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              editingCardId === card.id
                                ? "bg-blue-50 text-blue-600 border border-blue-100"
                                : "hover:bg-blue-50 text-gray-400 hover:text-blue-500"
                            }`}
                          >
                            <Edit3 size={12} />
                          </button>

                          <button
                            onClick={() => {
                              if (editingCardId === card.id) {
                                setEditingCardId(null);
                                setNewWord("");
                                setNewTranslation("");
                                setNewPos("");
                                setNewExample("");
                                setNewExampleTranslation("");
                              }
                              handleDeleteCard(card.id);
                            }}
                            id={`btn-delete-card-${card.id}`}
                            title="刪除此單字卡"
                            className="p-1.5 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-rose-500 transition-colors cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-gray-100 flex justify-end rounded-b-3xl">
              <button
                onClick={handleCloseEditModal}
                className="py-2.5 px-6 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-100 cursor-pointer"
              >
                完成並關閉
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MANAGE CATEGORIES MODAL */}
      {isManageCategoriesModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border border-gray-100 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-fade-in font-sans">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 rounded-xl text-blue-600">
                  <Tag size={18} />
                </span>
                <div>
                  <h3 className="font-bold text-gray-800 text-base leading-tight">管理分類篩選標題</h3>
                  <p className="text-[10px] text-gray-400 font-semibold mt-0.5">您可以新增、修改或刪除分類標籤</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsManageCategoriesModalOpen(false);
                  setEditingCategoryIndex(null);
                  setNewCategoryInput("");
                  setCategoryEditError(null);
                }}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body: Categories List and Add Field */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Add New Category Tag form */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-gray-500 uppercase">
                  新增分類標籤
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="輸入新分類 (例如: 托福、多益...)"
                    value={newCategoryInput}
                    onChange={e => {
                      setNewCategoryInput(e.target.value);
                      setCategoryEditError(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleAddNewCategory();
                      }
                    }}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewCategory}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Plus size={14} />
                    新增
                  </button>
                </div>
                {categoryEditError && (
                  <p className="text-[10px] text-rose-500 font-bold">{categoryEditError}</p>
                )}
              </div>

              {/* List of Existing Categories */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase">
                  現有分類列表 ({categories.length})
                </label>
                <div className="border border-gray-100 rounded-2xl bg-gray-50/30 divide-y divide-gray-100 max-h-[40vh] overflow-y-auto">
                  {categories.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400 font-bold">
                      目前沒有任何分類標籤。
                    </div>
                  ) : (
                    categories.map((cat, idx) => {
                      const count = sets.filter(s => s.tags && s.tags.includes(cat)).length;
                      const isEditing = editingCategoryIndex === idx;

                      return (
                        <div key={idx} className="p-3 flex items-center justify-between gap-3 text-xs">
                          {isEditing ? (
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                type="text"
                                value={editingCategoryValue}
                                onChange={e => setEditingCategoryValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleSaveEditCategory(idx);
                                  } else if (e.key === "Escape") {
                                    setEditingCategoryIndex(null);
                                    setEditingCategoryValue("");
                                  }
                                }}
                                className="flex-1 bg-white border border-blue-400 rounded-lg px-2.5 py-1 text-xs focus:outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveEditCategory(idx)}
                                className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white rounded-lg text-[10px] font-extrabold cursor-pointer shrink-0"
                              >
                                儲存
                              </button>
                              <button
                                onClick={() => {
                                  setEditingCategoryIndex(null);
                                  setEditingCategoryValue("");
                                }}
                                className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-lg text-[10px] font-bold cursor-pointer shrink-0"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="font-bold text-gray-700 truncate">{cat}</span>
                                <span className="text-[9px] bg-gray-100 text-gray-400 font-extrabold px-1.5 py-0.5 rounded shrink-0">
                                  {count} 組字卡
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingCategoryIndex(idx);
                                    setEditingCategoryValue(cat);
                                    setCategoryEditError(null);
                                  }}
                                  className="p-1.5 hover:bg-gray-100 text-blue-500 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                                  title="修改名稱"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() => {
                                    onDeleteCategory(cat);
                                    if (selectedFilterTag === cat) {
                                      setSelectedFilterTag(null);
                                    }
                                  }}
                                  className="p-1.5 hover:bg-rose-50 text-red-500 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="刪除此分類"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-100 p-4 flex justify-end bg-gray-50/30">
              <button
                type="button"
                onClick={() => {
                  setIsManageCategoriesModalOpen(false);
                  setEditingCategoryIndex(null);
                  setNewCategoryInput("");
                  setCategoryEditError(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
