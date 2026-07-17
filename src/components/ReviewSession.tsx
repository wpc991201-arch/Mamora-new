import React, { useState, useEffect } from "react";
import { Card, FlashcardSet, DetailedAIExplanation } from "../types";
import { 
  X, Check, AlertCircle, ArrowRight, RotateCcw, Play, 
  Sparkles, Layers, ListFilter, HelpCircle, Loader2, ArrowDown, ChevronDown, ChevronUp,
  Volume2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { speak } from "../utils/tts";

interface ReviewSessionProps {
  key?: string;
  set: FlashcardSet;
  reviewType: "all" | "forgotten";
  cardStyle?: string;
  onClose: () => void;
  onFinishReview: (rememberedIds: string[], forgottenIds: string[], isContinueChallenge: boolean) => void;
}

export default function ReviewSession({ set, reviewType, cardStyle = "minimalist_white", onClose, onFinishReview }: ReviewSessionProps) {
  // Filter cards based on review type
  const [initialCards] = useState<Card[]>(() => {
    if (reviewType === "forgotten") {
      return set.cards.filter(c => c.status === "forgotten");
    }
    return set.cards;
  });

  // Card styles mapping based on selected theme
  const themeClasses = (() => {
    switch (cardStyle) {
      case "deep_black":
        return {
          cardBg: "bg-slate-950 border-slate-800 text-slate-100",
          wordText: "text-slate-100",
          labelText: "text-slate-500",
          subCardBg: "bg-slate-900 border-slate-800/60",
          subCardText: "text-slate-300",
          badgeBg: "bg-slate-800 text-slate-300 border border-slate-700/50",
          guideText: "text-slate-400 font-bold bg-slate-900 px-4 py-2 rounded-full",
          guideSubtext: "text-slate-500",
          speakBtn: "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800/50",
          speakMiniBtn: "bg-slate-800 hover:bg-slate-700 text-slate-300",
        };
      case "soft_warm":
        return {
          cardBg: "bg-[#FCF9F2] border-[#EADFC9] text-[#4F3C24]",
          wordText: "text-[#4F3C24]",
          labelText: "text-[#9B8970]",
          subCardBg: "bg-[#F4EFE2] border-[#E6DBC3]",
          subCardText: "text-[#5C4D38]",
          badgeBg: "bg-[#F1E8D3] text-[#7A5B35] border border-[#E1D1B1]",
          guideText: "text-[#7A6B55] font-bold bg-[#F4EFE2] px-4 py-2 rounded-full",
          guideSubtext: "text-[#9B8970]",
          speakBtn: "bg-[#F1E8D3] hover:bg-[#EADBBE] text-[#7A5B35] border border-[#E1D1B1]/40",
          speakMiniBtn: "bg-[#FAF6EE] hover:bg-[#F1E8D3] text-[#7A5B35] border border-[#EADFC9]/50",
        };
      case "minimalist_white":
      default:
        return {
          cardBg: "bg-white border-gray-150 text-gray-800",
          wordText: "text-gray-800",
          labelText: "text-gray-400",
          subCardBg: "bg-gray-50 border-gray-100",
          subCardText: "text-gray-600",
          badgeBg: "bg-blue-50 text-blue-600 border border-blue-100/20",
          guideText: "text-gray-400 font-bold bg-gray-50 px-4 py-2 rounded-full",
          guideSubtext: "text-gray-300",
          speakBtn: "bg-blue-50 hover:bg-blue-100 text-blue-600",
          speakMiniBtn: "bg-gray-100 hover:bg-blue-50 text-blue-500",
        };
    }
  })();

  // Current states
  const [cards, setCards] = useState<Card[]>(() => {
    // Clone cards so we don't mutate parent state during session
    return initialCards.map(c => ({ ...c, sessionStatus: "unclassified" as any }));
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isClassifyOpen, setIsClassifyOpen] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // Tinder-style Swipe Gesture States
  const [dragX, setDragX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Track classifications made in this session
  // sessionStatus: 'unclassified' | 'forgotten' | 'remembered'
  const [sessionStatuses, setSessionStatuses] = useState<Record<string, "forgotten" | "remembered" | "unclassified">>(() => {
    const init: Record<string, "forgotten" | "remembered" | "unclassified"> = {};
    initialCards.forEach(c => {
      init[c.id] = "unclassified";
    });
    return init;
  });

  // Detailed AI analysis cache for forgotten cards
  const [aiExplanations, setAiExplanations] = useState<Record<string, DetailedAIExplanation>>({});
  const [loadingAiWord, setLoadingAiWord] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // For Drag and Drop
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);

  const currentCard = currentIndex < cards.length ? cards[currentIndex] : null;

  // Swipe logic (handles both gestures and button clicks)
  const handleSwipe = (direction: "remembered" | "forgotten") => {
    if (!currentCard || isAnimating) return;
    setIsAnimating(true);
    
    // Animate card off screen
    const flyOutOffset = direction === "remembered" ? 600 : -600;
    setDragX(flyOutOffset);
    
    setTimeout(() => {
      handleClassify(currentCard.id, direction);
      // Reset state for next card
      setDragX(0);
      setIsFlipped(false);
      setIsAnimating(false);
    }, 200);
  };

  // Keyboards listeners for easy flipping/classification
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFinished || isClassifyOpen || isAnimating) return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSwipe("forgotten");
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSwipe("remembered");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, isFinished, isClassifyOpen, currentCard, isAnimating]);

  const handleClassify = (cardId: string, status: "forgotten" | "remembered") => {
    setSessionStatuses(prev => ({
      ...prev,
      [cardId]: status
    }));
    setIsFlipped(false);
    
    // Auto advance if classifying the active card
    if (currentCard && currentCard.id === cardId) {
      if (currentIndex + 1 < cards.length) {
        setCurrentIndex(prev => prev + 1);
      } else {
        // We reached the end of the stack
        setIsFinished(true);
      }
    }
  };

  const handleMoveCard = (cardId: string, targetStatus: "forgotten" | "remembered" | "unclassified") => {
    setSessionStatuses(prev => ({
      ...prev,
      [cardId]: targetStatus
    }));
  };

  const getEncouragingMessage = (forgottenRatio: number) => {
    if (forgottenRatio === 0) {
      return {
        title: "完美無瑕！🌟",
        desc: "你已經完全掌握了這組單字，記憶力太驚人了，繼續保持！",
        color: "text-emerald-600"
      };
    } else if (forgottenRatio <= 0.2) {
      return {
        title: "太棒了！👏",
        desc: "只有極少數的單字需要再複習，你做得非常好，記憶牢固！",
        color: "text-green-600"
      };
    } else if (forgottenRatio <= 0.5) {
      return {
        title: "很好的嘗試！💪",
        desc: "大約有一半的單字已經完全記住了，多練習幾次就會越來越熟練喔！",
        color: "text-amber-600"
      };
    } else {
      return {
        title: "萬事起頭難！✨",
        desc: "別氣餒！這些被分類為遺忘的字，下方有 AI 幫你整理的詳細解析，讀完後再繼續挑戰吧！",
        color: "text-stone-600"
      };
    }
  };

  const totalCardsCount = cards.length;
  const rememberedCount = Object.values(sessionStatuses).filter(v => v === "remembered").length;
  const forgottenCount = Object.values(sessionStatuses).filter(v => v === "forgotten").length;
  const unclassifiedCount = Object.values(sessionStatuses).filter(v => v === "unclassified").length;
  const completedCount = rememberedCount + forgottenCount;

  // Ratio calculations
  const forgottenRatio = totalCardsCount > 0 ? forgottenCount / totalCardsCount : 0;
  const rememberedRatio = totalCardsCount > 0 ? rememberedCount / totalCardsCount : 0;
  const encouraging = getEncouragingMessage(forgottenRatio);

  // Generate SVG Pie Chart data
  const pieRadius = 40;
  const pieCircumference = 2 * Math.PI * pieRadius;
  const rememberedDash = pieCircumference * rememberedRatio;
  const forgottenDash = pieCircumference * forgottenRatio;

  // Handle Drag Events
  const onDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggedCardId(cardId);
    e.dataTransfer.setData("text/plain", cardId);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent, targetStatus: "forgotten" | "remembered" | "unclassified") => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain") || draggedCardId;
    if (cardId) {
      handleMoveCard(cardId, targetStatus);
    }
    setDraggedCardId(null);
  };

  // Fetch AI Analysis for a word
  const fetchAiExplanation = async (word: string) => {
    if (aiExplanations[word]) return; // Already loaded

    setLoadingAiWord(word);
    setAiError(null);
    try {
      const response = await fetch("/api/generate-forgotten-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word })
      });

      if (!response.ok) {
        throw new Error("AI 產生失敗，請稍後再試");
      }

      const data = await response.json();
      setAiExplanations(prev => ({
        ...prev,
        [word]: data
      }));
    } catch (err: any) {
      setAiError(err.message || "發生錯誤");
    } finally {
      setLoadingAiWord(null);
    }
  };

  // Finalize review session
  const handleSaveReviewSession = (isContinueChallenge: boolean) => {
    const rememberedIds = Object.keys(sessionStatuses).filter(id => sessionStatuses[id] === "remembered");
    const forgottenIds = Object.keys(sessionStatuses).filter(id => sessionStatuses[id] === "forgotten" || sessionStatuses[id] === "unclassified");

    onFinishReview(rememberedIds, forgottenIds, isContinueChallenge);
  };

  const forgottenCardsList = cards.filter(c => sessionStatuses[c.id] === "forgotten");

  return (
    <div className="fixed inset-0 z-50 bg-gray-50/98 overflow-y-auto flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="text-2xl w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100/20">{set.icon}</span>
          <div>
            <h1 className="font-bold text-gray-800 text-base leading-tight">{set.title}</h1>
            <p className="text-xs text-gray-400 font-medium">
              複習模式：{reviewType === "all" ? "全部單字" : "遺忘複習"} ({completedCount}/{totalCardsCount})
            </p>
          </div>
        </div>
        <button 
          onClick={onClose}
          id="btn-close-review"
          className="p-2.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={18} />
        </button>
      </header>

      {/* Main Review Window */}
      <div className="max-w-xl w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-between">
        {!isFinished && currentCard ? (
          /* Active Review Stage */
          <div className="flex-1 flex flex-col justify-center my-auto min-h-[420px]">
            {/* Progress bar */}
            <div className="w-full bg-gray-100 h-2 rounded-full mb-8 overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${(currentIndex / totalCardsCount) * 100}%` }}
              />
            </div>

            {/* Tactile Card Stack (一疊單字卡的感覺) */}
            <div className="relative w-full h-[320px] md:h-[350px] flex items-center justify-center my-6 select-none">
              {cards.map((card, idx) => {
                if (idx < currentIndex || idx > currentIndex + 2) return null;

                const diff = idx - currentIndex;
                const isTopCard = diff === 0;

                // Stack styles for depth
                const stackStyles = {
                  scale: 1 - diff * 0.05,
                  y: diff * 12,
                  zIndex: 30 - diff,
                  opacity: 1 - diff * 0.35,
                };

                return (
                  <motion.div
                    key={card.id}
                    id={`flashcard-${card.id}`}
                    drag={isTopCard ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.7}
                    onDrag={(e, info) => {
                      if (isTopCard) {
                        setDragX(info.offset.x);
                      }
                    }}
                    onDragEnd={(e, info) => {
                      if (!isTopCard) return;
                      if (info.offset.x > 120) {
                        handleSwipe("remembered");
                      } else if (info.offset.x < -120) {
                        handleSwipe("forgotten");
                      } else {
                        setDragX(0);
                      }
                    }}
                    onTap={(event) => {
                      const target = event.target as HTMLElement;
                      if (target && (target.closest("button") || target.closest(".cursor-pointer"))) {
                        return;
                      }
                      if (isTopCard) {
                        setIsFlipped(prev => !prev);
                      }
                    }}
                    animate={
                      isTopCard
                        ? {
                            x: dragX,
                            rotate: dragX * 0.06,
                            scale: 1,
                            zIndex: 30,
                            opacity: 1,
                          }
                        : stackStyles
                    }
                    transition={
                      isTopCard && dragX !== 0
                        ? { type: "tween", ease: "easeOut", duration: 0.18 }
                        : { type: "spring", stiffness: 300, damping: 25 }
                    }
                    className={`absolute w-full max-w-sm h-full rounded-3xl p-6 md:p-8 border shadow-md flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing transition-all duration-300 ${themeClasses.cardBg}`}
                  >
                    {/* Badge overlays while swiping */}
                    {isTopCard && Math.abs(dragX) > 15 && (
                      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                        {dragX > 0 ? (
                          <div 
                            className="bg-blue-500/10 border-2 border-blue-500 text-blue-600 font-extrabold text-xl px-6 py-3 rounded-2xl uppercase tracking-widest transform rotate-[-6deg]"
                            style={{ opacity: Math.min(1, Math.abs(dragX) / 80) }}
                          >
                            記得 👍
                          </div>
                        ) : (
                          <div 
                            className="bg-red-500/10 border-2 border-red-500 text-red-500 font-extrabold text-xl px-6 py-3 rounded-2xl uppercase tracking-widest transform rotate-[6deg]"
                            style={{ opacity: Math.min(1, Math.abs(dragX) / 80) }}
                          >
                            遺忘 👎
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sparkle decoration */}
                    <div className="absolute top-4 right-4 text-gray-200">
                      <Sparkles size={16} />
                    </div>

                    {!isFlipped || !isTopCard ? (
                      /* FRONT */
                      <div className="flex-1 flex flex-col justify-center items-center text-center">
                        <span className={`text-xs tracking-widest font-bold uppercase mb-2 ${themeClasses.labelText}`}>Word</span>
                        <div className="flex items-center gap-3.5 justify-center mb-1">
                          <h2 className={`text-3xl md:text-4xl font-extrabold tracking-tight font-mono ${themeClasses.wordText}`}>{card.word}</h2>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              speak(card.word);
                            }}
                            className={`p-2 rounded-full transition-colors cursor-pointer ${themeClasses.speakBtn}`}
                            title="朗讀單字"
                          >
                            <Volume2 size={18} />
                          </button>
                        </div>
                        {isTopCard && (
                          <p className={`text-[10px] mt-8 font-bold px-4 py-2 rounded-full ${themeClasses.guideText}`}>
                            點擊卡片以翻面，或左右滑動分類
                          </p>
                        )}
                      </div>
                    ) : (
                      /* BACK */
                      <div className="flex-1 flex flex-col justify-between">
                        <div className="text-center mt-2 flex flex-col items-center">
                          <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full mb-2 ${themeClasses.badgeBg}`}>
                            {card.pos || "詞性未註記"}
                          </span>
                          <div className="flex items-center gap-2 justify-center">
                            <h3 className={`text-2xl font-extrabold leading-snug ${themeClasses.wordText}`}>{card.translation}</h3>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                speak(card.word);
                              }}
                              className={`p-1.5 rounded-full transition-colors cursor-pointer ${themeClasses.speakMiniBtn}`}
                              title="朗讀英文發音"
                            >
                              <Volume2 size={14} />
                            </button>
                          </div>
                        </div>

                        {card.example && (
                          <div className={`border rounded-2xl p-4 mt-3 ${themeClasses.subCardBg}`}>
                            <div className="flex justify-between items-start gap-2">
                              <p className={`text-xs italic font-medium font-mono leading-relaxed flex-1 ${themeClasses.subCardText}`}>
                                "{card.example}"
                              </p>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  speak(card.example);
                                }}
                                className={`p-1.5 border rounded-lg transition-colors cursor-pointer shrink-0 ${themeClasses.speakMiniBtn}`}
                                title="朗讀例句"
                              >
                                <Volume2 size={13} />
                              </button>
                            </div>
                            {card.exampleTranslation && (
                              <p className={`text-[11px] mt-1.5 leading-relaxed font-sans ${themeClasses.guideSubtext}`}>
                                {card.exampleTranslation}
                              </p>
                            )}
                          </div>
                        )}

                        <p className={`text-center text-[10px] mt-3 font-mono ${themeClasses.guideSubtext}`}>
                          點擊可翻回正面
                        </p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Quick Action Guides */}
            <div className="text-center text-gray-400 text-xs mt-4 flex items-center justify-center gap-4 font-bold">
              <span>空白鍵：翻面</span>
              <span className="h-3 w-px bg-gray-200" />
              <span className="text-red-500/80">左滑 / ← 鍵：遺忘</span>
              <span className="h-3 w-px bg-gray-200" />
              <span className="text-blue-500/80">右滑 / → 鍵：記得</span>
            </div>

            {/* Classification Buttons */}
            <div className="mt-8 flex gap-4">
              <button
                onClick={() => handleSwipe("forgotten")}
                id="btn-mark-forgotten"
                className="flex-1 py-4 px-6 rounded-full font-bold border border-red-100 text-red-500 hover:bg-red-50 bg-white shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 animate-fade-in"
              >
                <AlertCircle size={14} />
                遺忘 (Forgotten)
              </button>
              
              <button
                onClick={() => handleSwipe("remembered")}
                id="btn-mark-remembered"
                className="flex-1 py-4 px-6 rounded-full font-bold border border-blue-100 text-blue-600 hover:bg-blue-50 bg-white shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 animate-fade-in"
              >
                <Check size={14} />
                記得 (Remembered)
              </button>
            </div>
          </div>
        ) : (
          /* Finished Review Summary View */
          <div className="flex-1 flex flex-col items-center">
            {/* Top Badge */}
            <span className="bg-blue-50 text-blue-600 text-xs px-4 py-2 rounded-full font-bold tracking-wide uppercase mb-4">
              複習完成
            </span>

            {/* Encouraging Quote Header */}
            <div className="text-center mb-8 max-w-md">
              <h2 className={`text-2xl font-bold ${encouraging.color} tracking-tight`}>{encouraging.title}</h2>
              <p className="text-gray-400 text-sm mt-2 leading-relaxed">{encouraging.desc}</p>
            </div>

            {/* Circle Pie Chart */}
            <div className="relative w-44 h-44 flex items-center justify-center bg-white rounded-full shadow-sm border border-gray-100 p-4 mb-8">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="50%"
                  cy="50%"
                  r={pieRadius}
                  className="stroke-gray-100 fill-transparent"
                  strokeWidth="12"
                />
                
                {/* Remembered slice (Green -> Blue accent) */}
                {rememberedCount > 0 && (
                  <circle
                    cx="50%"
                    cy="50%"
                    r={pieRadius}
                    className="stroke-blue-500 fill-transparent transition-all duration-500"
                    strokeWidth="12"
                    strokeDasharray={`${rememberedDash} ${pieCircumference}`}
                    strokeLinecap="round"
                  />
                )}

                {/* Forgotten slice (Red) */}
                {forgottenCount > 0 && (
                  <circle
                    cx="50%"
                    cy="50%"
                    r={pieRadius}
                    className="stroke-red-400 fill-transparent transition-all duration-500"
                    strokeWidth="12"
                    strokeDasharray={`${forgottenDash} ${pieCircumference}`}
                    strokeDashoffset={-rememberedDash}
                    strokeLinecap="round"
                  />
                )}
              </svg>

              {/* Central Text */}
              <div className="absolute text-center">
                <p className="text-2xl font-extrabold text-gray-700 tracking-tight">
                  {Math.round(rememberedRatio * 100)}%
                </p>
                <p className="text-[10px] text-gray-400 font-bold tracking-wider">記得比例</p>
              </div>
            </div>

            {/* Simple Numeric Details */}
            <div className="w-full flex justify-around border border-gray-100 py-5 mb-8 bg-gray-50/50 rounded-3xl px-6">
              <div className="text-center">
                <p className="text-xs text-gray-400 font-bold mb-1">記得單字</p>
                <p className="text-lg font-bold text-blue-600">{rememberedCount} 個</p>
              </div>
              <div className="h-8 w-px bg-gray-200 my-auto" />
              <div className="text-center">
                <p className="text-xs text-gray-400 font-bold mb-1">遺忘單字</p>
                <p className="text-lg font-bold text-red-500">{forgottenCount} 個</p>
              </div>
              <div className="h-8 w-px bg-gray-200 my-auto" />
              <div className="text-center">
                <p className="text-xs text-gray-400 font-bold mb-1">總複習單字</p>
                <p className="text-lg font-bold text-gray-700">{totalCardsCount} 個</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full flex gap-4 mb-12">
              <button
                onClick={() => handleSaveReviewSession(false)}
                id="btn-re-practice"
                className="flex-1 py-3.5 px-6 rounded-full border border-gray-200 hover:bg-gray-50 font-bold text-xs text-gray-700 transition-all flex items-center justify-center gap-2 cursor-pointer bg-white shadow-sm"
              >
                <RotateCcw size={14} />
                重新練習
              </button>

              <button
                disabled={forgottenCount === 0}
                onClick={() => handleSaveReviewSession(true)}
                id="btn-continue-challenge"
                className={`flex-1 py-3.5 px-6 rounded-full font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                  forgottenCount > 0
                    ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-100 cursor-pointer"
                    : "bg-gray-100 text-gray-300 border border-gray-200 cursor-not-allowed"
                }`}
              >
                <Play size={14} />
                繼續挑戰
              </button>
            </div>

            {/* Forgotten Detail List Scrolling Section */}
            {forgottenCardsList.length > 0 && (
              <div className="w-full border-t border-gray-100 pt-8" id="forgotten-words-analysis">
                <div className="flex items-center gap-2 mb-6">
                  <AlertCircle size={18} className="text-red-500" />
                  <h3 className="font-bold text-gray-800 text-lg">遺忘單詞詳細分析 & AI 解說</h3>
                </div>

                <p className="text-xs text-gray-400 font-bold mb-6 leading-relaxed">
                  點選單字卡展開查看 AI 生成的 KK 音標、習慣用法、不同詞性變化、同義詞以及更詳盡的辨析，幫助您深度記憶！
                </p>

                <div className="space-y-4">
                  {forgottenCardsList.map(card => (
                    <ForgottenCardItem
                      key={card.id}
                      card={card}
                      isExplLoading={loadingAiWord === card.word}
                      explanation={aiExplanations[card.word]}
                      aiError={aiError}
                      onFetchExplanation={fetchAiExplanation}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DRAG AND DROP MANUAL CLASSIFIER FLOATING TRAY BUTTON */}
      {!isFinished && (
        <button
          onClick={() => setIsClassifyOpen(true)}
          id="btn-open-drag-classifier"
          className="fixed bottom-6 right-6 bg-gray-900 text-white hover:bg-gray-800 px-5 py-3.5 rounded-full shadow-xl transition-all flex items-center gap-2 z-20 font-bold text-xs cursor-pointer active:scale-95"
        >
          <Layers size={14} />
          確認 / 調整分類 ({completedCount}/{totalCardsCount})
        </button>
      )}

      {/* DRAG AND DROP MODAL / TRAY */}
      <AnimatePresence>
        {isClassifyOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex justify-end"
            onClick={() => setIsClassifyOpen(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-gray-50 w-full max-w-xl h-full flex flex-col shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">手動調整與分類清單</h3>
                  <p className="text-xs text-gray-400 font-medium">使用拖曳（Drag & Drop）將字卡移至各分類欄位中</p>
                </div>
                <button
                  onClick={() => setIsClassifyOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Columns container */}
              <div className="flex-1 overflow-y-auto p-5 grid grid-cols-3 gap-3 min-h-0">
                {/* Column 1: Unclassified */}
                <div 
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, "unclassified")}
                  className="bg-gray-100/50 rounded-2xl border border-gray-200/40 p-3 flex flex-col"
                >
                  <h4 className="text-xs font-bold text-gray-500 tracking-wider text-center mb-3 pb-1 border-b border-gray-200/40">
                    未分類 ({unclassifiedCount})
                  </h4>
                  <div className="flex-1 space-y-2 overflow-y-auto pb-10 min-h-[150px]">
                    {cards.map(card => {
                      if (sessionStatuses[card.id] !== "unclassified") return null;
                      return (
                        <div
                          key={card.id}
                          draggable
                           onDragStart={(e) => onDragStart(e, card.id)}
                          className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-300 transition-colors"
                        >
                          <p className="text-xs font-bold text-gray-700 font-mono truncate">{card.word}</p>
                        </div>
                      );
                    })}
                    {unclassifiedCount === 0 && (
                      <p className="text-[10px] text-gray-300 text-center py-4 italic">無字卡</p>
                    )}
                  </div>
                </div>

                {/* Column 2: Forgotten (Red) */}
                <div 
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, "forgotten")}
                  className="bg-rose-50/50 rounded-2xl border border-rose-100 p-3 flex flex-col"
                >
                  <h4 className="text-xs font-bold text-rose-500 tracking-wider text-center mb-3 pb-1 border-b border-rose-100">
                    遺忘 🔴 ({forgottenCount})
                  </h4>
                  <div className="flex-1 space-y-2 overflow-y-auto pb-10 min-h-[150px]">
                    {cards.map(card => {
                      if (sessionStatuses[card.id] !== "forgotten") return null;
                      return (
                        <div
                          key={card.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, card.id)}
                          className="bg-white p-3 rounded-xl border border-rose-200 shadow-sm cursor-grab active:cursor-grabbing hover:border-rose-400 transition-colors"
                        >
                          <p className="text-xs font-bold text-rose-600 font-mono truncate">{card.word}</p>
                        </div>
                      );
                    })}
                    {forgottenCount === 0 && (
                      <p className="text-[10px] text-gray-300 text-center py-4 italic">無字卡</p>
                    )}
                  </div>
                </div>

                {/* Column 3: Remembered (Blue/Green) */}
                <div 
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, "remembered")}
                  className="bg-blue-50/40 rounded-2xl border border-blue-100/50 p-3 flex flex-col"
                >
                  <h4 className="text-xs font-bold text-blue-600 tracking-wider text-center mb-3 pb-1 border-b border-blue-100">
                    記得 🔵 ({rememberedCount})
                  </h4>
                  <div className="flex-1 space-y-2 overflow-y-auto pb-10 min-h-[150px]">
                    {cards.map(card => {
                      if (sessionStatuses[card.id] !== "remembered") return null;
                      return (
                        <div
                          key={card.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, card.id)}
                          className="bg-white p-3 rounded-xl border border-blue-200 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 transition-colors"
                        >
                          <p className="text-xs font-bold text-blue-600 font-mono truncate">{card.word}</p>
                        </div>
                      );
                    })}
                    {rememberedCount === 0 && (
                      <p className="text-[10px] text-gray-300 text-center py-4 italic">無字卡</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Save Action */}
              <div className="p-4 bg-white border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => setIsClassifyOpen(false)}
                  className="flex-1 py-3 rounded-full border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-600"
                >
                  返回複習
                </button>
                <button
                  onClick={() => {
                    setIsClassifyOpen(false);
                    setIsFinished(true);
                  }}
                  id="btn-finish-drag-sorting"
                  className="flex-1 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-100"
                >
                  確認分類並結束
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ForgottenCardItemProps {
  card: Card;
  isExplLoading: boolean;
  explanation: DetailedAIExplanation | undefined;
  aiError: string | null;
  onFetchExplanation: (word: string) => any;
}

const ForgottenCardItem: React.FC<ForgottenCardItemProps> = ({ card, isExplLoading, explanation, aiError, onFetchExplanation }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    if (!isExpanded) {
      onFetchExplanation(card.word);
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden transition-all duration-200">
      {/* Word Header */}
      <div 
        onClick={toggleExpand}
        className="px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-gray-800 text-base font-mono">{card.word}</h4>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  speak(card.word);
                }}
                className="p-1 hover:bg-red-50 text-red-500 rounded-full transition-colors cursor-pointer"
                title="朗讀單字"
              >
                <Volume2 size={14} />
              </button>
            </div>
            <p className="text-xs text-gray-400 font-bold mt-0.5">
              {card.pos} {card.translation}
            </p>
          </div>
        </div>
        <div>
          {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-50"
          >
            <div className="p-6 bg-gray-50/50 text-sm text-gray-700 space-y-5">
              {isExplLoading && (
                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                  <Loader2 className="animate-spin text-blue-500" size={24} />
                  <p className="text-xs text-gray-400 font-bold animate-pulse">
                    AI 正在為您撰寫個人化的字彙解析，請稍候...
                  </p>
                </div>
              )}

              {aiError && !explanation && !isExplLoading && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs flex items-center gap-2 shadow-sm">
                  <AlertCircle size={14} />
                  <span>{aiError}</span>
                  <button 
                    onClick={() => onFetchExplanation(card.word)}
                    className="underline font-bold ml-auto"
                  >
                    重試
                  </button>
                </div>
              )}

              {explanation && (
                <div className="space-y-5">
                  {/* Phonetic Pronunciation */}
                  {explanation.phonetic && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1.5">KK 音標 / 發音</h5>
                      <p className="text-blue-600 font-mono text-sm font-bold bg-blue-50/60 px-3 py-1 inline-block rounded-xl border border-blue-100/20">
                        {explanation.phonetic}
                      </p>
                    </div>
                  )}

                  {/* Usages / Collocations */}
                  {explanation.usages && explanation.usages.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">常見搭配與例句習慣用法</h5>
                      <ul className="list-disc pl-5 space-y-1.5 text-xs font-medium text-gray-600">
                        {explanation.usages.map((usage, idx) => (
                          <li key={idx}>{usage}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Variations / Words forms */}
                  {explanation.variations && explanation.variations.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">衍生詞與詞性變化</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {explanation.variations.map((v, idx) => (
                          <div key={idx} className="bg-white border border-gray-100 rounded-2xl p-4 text-xs shadow-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-gray-800">{v.word}</span>
                              <span className="text-[10px] text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full font-bold">{v.pos}</span>
                            </div>
                            <p className="text-gray-500 mt-2 font-medium leading-relaxed">{v.meaning}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Synonyms */}
                  {explanation.synonyms && explanation.synonyms.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">近義詞與辨析</h5>
                      <div className="flex flex-wrap gap-2">
                        {explanation.synonyms.map((s, idx) => (
                          <span 
                            key={idx} 
                            className="bg-white border border-gray-100 text-gray-600 text-xs px-3.5 py-1.5 rounded-full font-bold shadow-sm"
                          >
                            <strong className="font-mono text-gray-800 mr-1">{s.word}</strong>
                            <span className="text-[10px] text-gray-400">({s.meaning})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detailed explanation */}
                  {explanation.detailedExplanation && (
                    <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
                      <h5 className="text-xs font-bold text-blue-600 tracking-wider uppercase mb-2 flex items-center gap-1">
                        <Sparkles size={12} />
                        字彙辨析與使用叮嚀
                      </h5>
                      <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line font-medium">
                        {explanation.detailedExplanation}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
