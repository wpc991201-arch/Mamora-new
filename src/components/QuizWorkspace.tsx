import React, { useState } from "react";
import { FlashcardSet, Card } from "../types";
import { 
  X, HelpCircle, Sparkles, Loader2, CheckCircle2, AlertCircle, RefreshCw, Trophy, ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface QuizWorkspaceProps {
  set: FlashcardSet;
  onClose: () => void;
  onUpdateSet: (setId: string, title: string, icon: string, cards: Card[], extraFields?: Partial<FlashcardSet>) => void;
  onRecordQuizPerfectScore?: () => void;
  forgottenSpacingSteps?: number[];
}

interface QuizQuestion {
  id: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  word?: string;
}

interface MatchingPair {
  word: string;
  definition: string;
}

export default function QuizWorkspace({ set, onClose, onUpdateSet, onRecordQuizPerfectScore, forgottenSpacingSteps }: QuizWorkspaceProps) {
  // Config state
  const [difficulty, setDifficulty] = useState<string>("中等");
  const [count, setCount] = useState<number>(5);
  const [quizType, setQuizType] = useState<string>("選擇題");

  // Flow state
  const [step, setStep] = useState<"config" | "loading" | "testing" | "result">("config");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Quiz data from backend
  const [quizPassage, setQuizPassage] = useState<string>("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [matchingPairs, setMatchingPairs] = useState<MatchingPair[]>([]);

  // User answers
  const [userAnswers, setUserAnswers] = useState<{ [key: string]: string }>({});
  
  // Word matching specific state
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<{ [key: string]: string }>({}); // map word -> definition
  const [wrongMatches, setWrongMatches] = useState<{ [key: string]: boolean }>({}); // transient flashing error state
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);
  const [shuffledDefs, setShuffledDefs] = useState<string[]>([]);

  // Generate quiz
  const handleGenerateQuiz = async () => {
    if (!set.cards || set.cards.length < 2) {
      setErrorMsg("單字卡組中的單字數量過少（至少需要 2 個單字以上才能生成測驗）。");
      return;
    }

    setStep("loading");
    setIsGenerating(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: set.cards,
          difficulty,
          count,
          quizType
        })
      });

      if (!res.ok) {
        throw new Error("伺服器繁忙，無法生成測驗，請再試一次。");
      }

      const data = await res.json();
      setQuizPassage(data.passage || "");
      setQuestions(data.questions || []);
      
      const pairs = data.matchingPairs || [];
      setMatchingPairs(pairs);

      // Reset user answers
      setUserAnswers({});
      setMatchedPairs({});
      setSelectedWord(null);

      if (quizType === "單字配對" && pairs.length > 0) {
        // Shuffle lists
        const words = pairs.map((p: MatchingPair) => p.word);
        const defs = pairs.map((p: MatchingPair) => p.definition);
        setShuffledWords([...words].sort(() => Math.random() - 0.5));
        setShuffledDefs([...defs].sort(() => Math.random() - 0.5));
      }

      setStep("testing");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "生成測驗失敗，請檢查網路連線。");
      setStep("config");
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle single question selection
  const handleSelectAnswer = (qId: string, answer: string) => {
    setUserAnswers(prev => ({ ...prev, [qId]: answer }));
  };

  // Word Matching click handler
  const handleWordClick = (word: string) => {
    if (matchedPairs[word]) return; // already matched
    setSelectedWord(word === selectedWord ? null : word);
  };

  const handleDefClick = (def: string) => {
    if (!selectedWord) return;
    
    // Check if this is the correct match based on original matchingPairs
    const correctPair = matchingPairs.find(p => p.word === selectedWord);
    if (correctPair && correctPair.definition === def) {
      // Correct Match!
      setMatchedPairs(prev => ({ ...prev, [selectedWord]: def }));
      setSelectedWord(null);
    } else {
      // Incorrect Match - flash error
      const badWord = selectedWord;
      setWrongMatches(prev => ({ ...prev, [badWord]: true, [def]: true }));
      setSelectedWord(null);
      setTimeout(() => {
        setWrongMatches(prev => ({ ...prev, [badWord]: false, [def]: false }));
      }, 800);
    }
  };

  // Helper to map a quiz question back to its corresponding target flashcard word
  const findTargetWordForQuestion = (q: QuizQuestion, cards: Card[]): string | null => {
    if (q.word) {
      const found = cards.find(c => c.word.toLowerCase() === q.word?.toLowerCase());
      if (found) return found.word;
    }
    // Fallback heuristic: check if any card word is inside correctAnswer or options
    const cleanCorrect = q.correctAnswer.toLowerCase();
    for (const card of cards) {
      const cardWordLower = card.word.toLowerCase();
      if (cleanCorrect.includes(cardWordLower)) {
        return card.word;
      }
      if (q.options) {
        for (const opt of q.options) {
          if (opt.toLowerCase().includes(cardWordLower) && cleanCorrect.includes(opt.toLowerCase())) {
            return card.word;
          }
        }
      }
    }
    return null;
  };

  // Grade Quiz
  const handleSubmitQuiz = () => {
    const incorrectWords: string[] = [];

    if (quizType === "單字配對") {
      matchingPairs.forEach(pair => {
        const userDef = matchedPairs[pair.word];
        const isCorrect = userDef === pair.definition;
        if (!isCorrect) {
          incorrectWords.push(pair.word);
        }
      });
    } else {
      questions.forEach(q => {
        const userAns = (userAnswers[q.id] || "").trim().toLowerCase();
        const correctAns = q.correctAnswer.trim().toLowerCase();
        
        let isCorrect = false;

        if (quizType === "選擇題" || quizType === "文章挖空") {
          // Choice selection often starts with "A) " or "A. " - handle loose matching
          const cleanUser = userAns.replace(/^[a-d][\s).、:-]*/i, "").trim();
          const cleanCorrect = correctAns.replace(/^[a-d][\s).、:-]*/i, "").trim();
          if (cleanUser === cleanCorrect || userAns === correctAns || userAns.startsWith(correctAns[0])) {
            isCorrect = true;
          }
        } else {
          // Fill in blank - simple contains or equality match
          if (cleanAnswerText(userAns) === cleanAnswerText(correctAns)) {
            isCorrect = true;
          }
        }

        if (!isCorrect) {
          const targetWord = findTargetWordForQuestion(q, set.cards);
          if (targetWord) {
            incorrectWords.push(targetWord);
          }
        }
      });
    }

    if (incorrectWords.length > 0) {
      const todayStr = new Date().toISOString().split("T")[0];
      const addDaysToDate = (dateStr: string, days: number): string => {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().split("T")[0];
      };

      const updatedCards = set.cards.map(card => {
        const isIncorrect = incorrectWords.some(
          w => w.toLowerCase() === card.word.toLowerCase()
        );

        if (isIncorrect) {
          const firstForgotStep = (forgottenSpacingSteps && forgottenSpacingSteps[0]) || 1;
          return {
            ...card,
            status: "forgotten" as const,
            intervalDays: firstForgotStep,
            nextReviewDate: addDaysToDate(todayStr, firstForgotStep),
            history: [...card.history, { date: todayStr, status: "forgotten" as const }]
          };
        }
        return card;
      });

      onUpdateSet(set.id, set.title, set.icon, updatedCards);
    }

    setStep("result");
    const finalScore = getScoreInfo();
    if (finalScore.score === 100 && onRecordQuizPerfectScore) {
      onRecordQuizPerfectScore();
    }
  };

  // Calculate score for non-matching quizzes
  const getScoreInfo = () => {
    if (quizType === "單字配對") {
      const correctCount = Object.keys(matchedPairs).length;
      const totalCount = matchingPairs.length;
      const pct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
      return { score: pct, correct: correctCount, total: totalCount };
    }

    let correctCount = 0;
    questions.forEach(q => {
      const userAns = (userAnswers[q.id] || "").trim().toLowerCase();
      const correctAns = q.correctAnswer.trim().toLowerCase();

      if (quizType === "選擇題" || quizType === "文章挖空") {
        // Choice selection often starts with "A) " or "A. " - let's handle loose matching
        const cleanUser = userAns.replace(/^[a-d][\s).、:-]*/i, "").trim();
        const cleanCorrect = correctAns.replace(/^[a-d][\s).、:-]*/i, "").trim();
        if (cleanUser === cleanCorrect || userAns === correctAns || userAns.startsWith(correctAns[0])) {
          correctCount++;
        }
      } else {
        // Fill in blank - simple contains or equality match
        if (cleanAnswerText(userAns) === cleanAnswerText(correctAns)) {
          correctCount++;
        }
      }
    });

    const totalCount = questions.length;
    const pct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    return { score: pct, correct: correctCount, total: totalCount };
  };

  const cleanAnswerText = (text: string) => {
    return text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim().toLowerCase();
  };

  const scoreInfo = getScoreInfo();

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4"
    >
      <motion.div 
        initial={{ scale: 0.96, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 15 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col relative"
      >
        {/* Header */}
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-xl shadow-sm border border-purple-100/50">
              ✍️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-slate-800 text-base">
                  AI 智慧測驗生成
                </h2>
                <span className="text-[10px] bg-purple-100 text-purple-700 font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-0.5 border border-purple-200/20">
                  {set.title}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                AI Quiz Generator • 驗收與情境記憶挑戰
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all border border-slate-200/20 shadow-sm cursor-pointer"
          >
            <X size={15} />
          </button>
        </header>

        {/* Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          
          {/* STEP 1: CONFIGURATION */}
          {step === "config" && (
            <div className="max-w-xl mx-auto space-y-6 py-6">
              <div className="text-center space-y-1.5 mb-2">
                <h3 className="text-lg font-bold text-slate-800">設計您的專屬 AI 測驗</h3>
                <p className="text-xs text-slate-400">AI 將根據該字卡組內的單字，動態分析語意、情境並設計成挑戰題目。</p>
              </div>

              {errorMsg && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-xs text-rose-600 font-bold animate-fade-in">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* 1. Quiz Type */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  🎯 想要進行的測驗方式
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { type: "選擇題", icon: "🔢", desc: "精準文意與拼寫" },
                    { type: "填充題", icon: "✍️", desc: "主動拼字回想" },
                    { type: "文章挖空", icon: "📰", desc: "段落情境綜合理解" },
                    { type: "單字配對", icon: "🧩", desc: "連連看快速對照" }
                  ].map(item => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setQuizType(item.type)}
                      className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                        quizType === item.type 
                          ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-100" 
                          : "bg-white border-slate-200 hover:border-purple-300 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <span className="font-extrabold text-xs">{item.type}</span>
                      <span className={`text-[9px] font-medium leading-tight ${quizType === item.type ? "text-purple-100" : "text-slate-400"}`}>
                        {item.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Difficulty & Question Count */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Difficulty */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    ⚡ 測驗難易度
                  </label>
                  <div className="flex bg-white rounded-2xl p-1 border border-slate-200 shadow-sm">
                    {["簡單", "中等", "困難"].map(level => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDifficulty(level)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          difficulty === level
                            ? "bg-purple-600 text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Count */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    📝 測驗題目數量
                  </label>
                  <div className="flex bg-white rounded-2xl p-1 border border-slate-200 shadow-sm">
                    {[5, 10, 15, 20].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCount(num)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          count === num
                            ? "bg-purple-600 text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {num} 題
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateQuiz}
                className="w-full mt-4 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-full cursor-pointer shadow-lg shadow-indigo-150 flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02]"
              >
                <Sparkles size={14} className="animate-pulse" />
                開始生成 AI 智慧測驗
              </button>
            </div>
          )}

          {/* STEP 2: GENERATING */}
          {step === "loading" && (
            <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
              <Loader2 className="animate-spin text-purple-600" size={36} />
              <div className="space-y-1">
                <h4 className="font-bold text-slate-700 text-sm">AI 正在為您量身打造題目</h4>
                <p className="text-xs text-slate-400">根據您的字卡生詞，正在編排考題、分析情境與句型解析中，請稍候...</p>
              </div>
            </div>
          )}

          {/* STEP 3: TESTING (TAKING THE TEST) */}
          {step === "testing" && (
            <div className="space-y-6">
              
              {/* Passage for Cloze test */}
              {quizType === "文章挖空" && quizPassage && (
                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-3">
                  <h4 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">閱讀文章段落 (Cloze Reading)</h4>
                  <div className="text-sm text-slate-700 font-medium font-serif leading-relaxed bg-slate-50/50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap">
                    {quizPassage}
                  </div>
                </div>
              )}

              {/* Word Matching Gameplay */}
              {quizType === "單字配對" ? (
                <div className="space-y-4">
                  <div className="text-center bg-purple-50 border border-purple-100 p-3 rounded-2xl text-xs text-purple-700 font-bold mb-4">
                    🧩 連連看：請點擊左側的「英文單字」，再點擊右側對應的「中文翻譯」來完成配對！
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto">
                    {/* Left Column: English words */}
                    <div className="space-y-2">
                      <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-wider text-center">英文單字 (Words)</h4>
                      {shuffledWords.map(word => {
                        const isMatched = !!matchedPairs[word];
                        const isSelected = selectedWord === word;
                        const isWrong = !!wrongMatches[word];

                        return (
                          <button
                            key={word}
                            onClick={() => handleWordClick(word)}
                            disabled={isMatched}
                            className={`w-full p-4 rounded-2xl border text-sm font-extrabold font-mono transition-all text-center ${
                              isMatched 
                                ? "bg-emerald-50 border-emerald-200 text-emerald-600 line-through opacity-60" 
                                : isWrong
                                ? "bg-rose-100 border-rose-300 text-rose-600 animate-shake"
                                : isSelected
                                ? "bg-purple-600 border-purple-600 text-white scale-102 shadow-md"
                                : "bg-white border-slate-200 text-slate-700 hover:border-purple-300 hover:bg-slate-50/50 cursor-pointer"
                            }`}
                          >
                            {word}
                          </button>
                        );
                      })}
                    </div>

                    {/* Right Column: Chinese definitions */}
                    <div className="space-y-2">
                      <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-wider text-center">中文釋義 (Definitions)</h4>
                      {shuffledDefs.map(def => {
                        // Check if this definition is already matched
                        const isMatched = Object.values(matchedPairs).includes(def);
                        const isWrong = !!wrongMatches[def];

                        return (
                          <button
                            key={def}
                            onClick={() => handleDefClick(def)}
                            disabled={isMatched || !selectedWord}
                            className={`w-full p-4 rounded-2xl border text-xs font-bold transition-all text-center ${
                              isMatched 
                                ? "bg-emerald-50 border-emerald-200 text-emerald-600 line-through opacity-60" 
                                : isWrong
                                ? "bg-rose-100 border-rose-300 text-rose-600 animate-shake"
                                : selectedWord
                                ? "bg-white border-purple-200 text-slate-700 hover:bg-purple-50/30 cursor-pointer"
                                : "bg-slate-50/30 border-slate-150 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            {def}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* Question List */
                <div className="space-y-5">
                  {questions.map((q, idx) => (
                    <div 
                      key={q.id}
                      className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-3 transition-all hover:border-slate-300"
                    >
                      <div className="flex gap-2.5 items-start">
                        <span className="w-6 h-6 bg-purple-50 text-purple-600 font-extrabold text-xs rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="text-xs font-bold text-slate-700 leading-relaxed font-mono">
                          {q.question}
                        </div>
                      </div>

                      {/* Options rendering */}
                      {q.options && q.options.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-8">
                          {q.options.map(option => {
                            const isSelected = userAnswers[q.id] === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => handleSelectAnswer(q.id, option)}
                                className={`p-3 text-left rounded-xl border text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
                                  isSelected
                                    ? "bg-purple-50 border-purple-500 text-purple-700 font-bold"
                                    : "bg-slate-50/30 border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                                }`}
                              >
                                <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[8px] font-bold shrink-0 ${
                                  isSelected ? "bg-purple-600 border-purple-600 text-white" : "border-slate-300 text-slate-400"
                                }`}>
                                  ✓
                                </span>
                                <span>{option}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        /* Fill in the blank Input */
                        <div className="pl-8">
                          <input
                            type="text"
                            placeholder="請在此處輸入正確的英文單字答案..."
                            value={userAnswers[q.id] || ""}
                            onChange={e => handleSelectAnswer(q.id, e.target.value)}
                            className="w-full md:max-w-md bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Submit panel */}
              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleSubmitQuiz}
                  className="py-3 px-8 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-full shadow-lg shadow-indigo-100 cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <CheckCircle2 size={14} />
                  交卷並查看測驗結果
                </button>
              </div>

            </div>
          )}

          {/* STEP 4: GRADED / RESULTS */}
          {step === "result" && (
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* Scorecard Hero */}
              <div className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-3xl p-6 text-white text-center space-y-4 shadow-xl shadow-purple-100/40 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-8 -translate-x-8" />

                <Trophy size={48} className="mx-auto text-yellow-300 animate-bounce" />
                
                <div className="space-y-1 relative z-10">
                  <h3 className="text-xl font-black">測驗挑戰完成！</h3>
                  <p className="text-xs text-purple-100 font-medium">答對 {scoreInfo.correct} 題 / 共 {scoreInfo.total} 題</p>
                </div>

                <div className="inline-block bg-white/10 backdrop-blur-md border border-white/20 px-6 py-2.5 rounded-2xl relative z-10">
                  <span className="text-[10px] text-purple-200 font-bold uppercase tracking-widest block">總體分數 (Score)</span>
                  <span className="text-4xl font-extrabold font-mono tracking-tight text-white">{scoreInfo.score} 分</span>
                </div>
              </div>

              {/* Review and correction cards */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <span>📝 題目檢討與詳細解析</span>
                </h4>

                {quizType === "單字配對" ? (
                  <div className="space-y-3">
                    {matchingPairs.map((pair, index) => {
                      const userDef = matchedPairs[pair.word];
                      const isCorrect = userDef === pair.definition;

                      return (
                        <div 
                          key={index}
                          className={`bg-white border p-4 rounded-2xl flex items-start gap-3 shadow-sm transition-all ${
                            isCorrect ? "border-emerald-100" : "border-rose-100"
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5 ${
                            isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}>
                            {isCorrect ? "✓" : "✗"}
                          </span>
                          
                          <div className="text-xs space-y-1 flex-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="font-extrabold text-slate-800 font-mono text-sm">{pair.word}</span>
                              <span className="text-slate-400">正確配對釋義：</span>
                              <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{pair.definition}</span>
                            </div>
                            <p className="text-slate-400 text-[10px] leading-relaxed italic mt-1.5">
                              配對正確！此單字是您卡片組的核心詞彙。
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  questions.map((q, idx) => {
                    const userAns = userAnswers[q.id] || "未作答";
                    const correctAns = q.correctAnswer;
                    
                    let isCorrect = false;
                    const cleanUser = userAns.trim().toLowerCase();
                    const cleanCorrect = correctAns.trim().toLowerCase();

                    if (quizType === "選擇題" || quizType === "文章挖空") {
                      const cleanU = cleanUser.replace(/^[a-d][\s).、:-]*/i, "").trim();
                      const cleanC = cleanCorrect.replace(/^[a-d][\s).、:-]*/i, "").trim();
                      isCorrect = cleanU === cleanC || cleanUser === cleanCorrect || cleanUser.startsWith(cleanCorrect[0]);
                    } else {
                      isCorrect = cleanAnswerText(cleanUser) === cleanAnswerText(cleanCorrect);
                    }

                    return (
                      <div 
                        key={q.id}
                        className={`bg-white border p-5 rounded-2xl shadow-sm space-y-3.5 transition-all ${
                          isCorrect ? "border-emerald-100" : "border-rose-100"
                        }`}
                      >
                        <div className="flex gap-2.5 items-start">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5 ${
                            isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}>
                            {isCorrect ? "✓" : "✗"}
                          </span>
                          <div className="text-xs font-extrabold text-slate-700 leading-relaxed font-mono">
                            {idx + 1}. {q.question}
                          </div>
                        </div>

                        {/* Answer analysis */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-7 text-[11px]">
                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 font-bold block mb-0.5">您的答案：</span>
                            <span className={`font-mono font-bold ${isCorrect ? "text-emerald-600" : "text-rose-500"}`}>
                              {userAns}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-purple-50/40 border border-purple-100/50">
                            <span className="text-purple-400 font-bold block mb-0.5">正確答案：</span>
                            <span className="font-mono font-bold text-purple-700">
                              {correctAns}
                            </span>
                          </div>
                        </div>

                        {/* Explanation block */}
                        <div className="pl-7 pt-2.5 border-t border-slate-50 text-xs text-slate-500 leading-relaxed bg-slate-50/40 p-3 rounded-xl">
                          <div className="font-extrabold text-slate-600 mb-1 flex items-center gap-1.5">
                            <Sparkles size={12} className="text-purple-500" />
                            AI 老師深度解析：
                          </div>
                          <p>{q.explanation}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep("config")}
                  className="py-2.5 px-6 rounded-full border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw size={13} />
                  重新設定新測驗
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-6 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-100 cursor-pointer flex items-center gap-1.5"
                >
                  完成並返回卡庫
                  <ArrowRight size={13} />
                </button>
              </div>

            </div>
          )}

        </div>
      </motion.div>
    </motion.div>
  );
}
