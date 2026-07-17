import React, { useState, useRef, useEffect } from "react";
import { FlashcardSet, Card, WordDetail } from "../types";
import { 
  X, Send, Sparkles, BookOpen, HelpCircle, MessageSquare, 
  Layers, ChevronRight, CheckCircle2, Loader2, RefreshCw, GraduationCap, ChevronDown,
  Volume2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { speak } from "../utils/tts";

interface NotebookWorkspaceProps {
  set: FlashcardSet;
  onClose: () => void;
  onUpdateSet: (setId: string, title: string, icon: string, cards: Card[], extraFields?: Partial<FlashcardSet>) => void;
}

// Simple Markdown Line Formatter to render Study Guides beautifully without bloating bundle size
function renderInlineStyles(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-extrabold text-slate-800">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(text: string | undefined) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    // Headers
    if (line.startsWith("### ")) {
      return <h4 key={idx} className="text-sm font-extrabold text-slate-800 mt-4 mb-2">{line.replace("### ", "")}</h4>;
    }
    if (line.startsWith("## ")) {
      return <h3 key={idx} className="text-base font-extrabold text-slate-900 mt-5 mb-3 border-b border-slate-150/40 pb-1">{line.replace("## ", "")}</h3>;
    }
    if (line.startsWith("# ")) {
      return <h2 key={idx} className="text-lg font-extrabold text-slate-900 mt-6 mb-4">{line.replace("# ", "")}</h2>;
    }
    // Blockquotes
    if (line.startsWith("> ")) {
      return (
        <blockquote key={idx} className="border-l-4 border-purple-500 bg-purple-50/50 px-4 py-2 my-3 rounded-r-xl text-xs text-slate-600 leading-relaxed italic">
          {line.replace("> ", "")}
        </blockquote>
      );
    }
    // Lists
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const content = line.trim().substring(2);
      return (
        <ul key={idx} className="list-disc list-inside pl-2 my-1 text-xs text-slate-600 leading-relaxed">
          <li className="text-slate-600">{renderInlineStyles(content)}</li>
        </ul>
      );
    }
    // Numbered Lists
    if (/^\d+\.\s/.test(line.trim())) {
      const content = line.trim().replace(/^\d+\.\s/, "");
      return (
        <ol key={idx} className="list-decimal list-inside pl-2 my-1 text-xs text-slate-600 leading-relaxed">
          <li className="text-slate-600">{renderInlineStyles(content)}</li>
        </ol>
      );
    }
    // Standard Paragraph
    if (line.trim() === "") return <div key={idx} className="h-2" />;
    return (
      <p key={idx} className="text-xs text-slate-600 leading-relaxed mb-2.5">
        {renderInlineStyles(line)}
      </p>
    );
  });
}

export default function NotebookWorkspace({ set, onClose, onUpdateSet }: NotebookWorkspaceProps) {
  // Unified Tabs: "briefing" | "exam_skills" | "cards" | "chat" | "faq"
  const [activeTab, setActiveTab] = useState<"briefing" | "exam_skills" | "cards" | "chat" | "faq">("briefing");

  // Chat message state
  const [chatInput, setChatInput] = useState("");
  const [isAiReplying, setIsAiReplying] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>(() => {
    return set.chatMessages || [
      {
        id: `chat-init-${Date.now()}`,
        sender: "ai",
        text: `哈囉！我是您的智慧統整讀書助理。我已經深入閱讀並分析了這篇來源資料，並且：\n\n1. 幫您編寫了完整的「學習導讀與精華」\n2. 整理出「核心單字卡」與「應考技巧與重點整理」\n3. 準備了幾題「閱讀理解問答（FAQ）」\n\n您可以隨時在下方對我提問，我會根據本文內容來為您解惑、造句、或進行小測驗喔！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  // Keep chat scrolled to bottom
  const chatBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, activeTab]);

  // Expandable state for FAQ items
  const [expandedFaqIdx, setExpandedFaqIdx] = useState<number | null>(null);

  // Vocabulary card detail caching and expansion states
  const [wordDetails, setWordDetails] = useState<{ [word: string]: WordDetail }>(() => {
    return set.wordDetails || {};
  });
  const [loadingWord, setLoadingWord] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Keep in sync with set changes
  useEffect(() => {
    setWordDetails(set.wordDetails || {});
    setExpandedCardId(null);
  }, [set.id]);

  // Fetch detailed word lookup
  const handleCardExpand = async (card: Card) => {
    if (expandedCardId === card.id) {
      setExpandedCardId(null);
      return;
    }

    setExpandedCardId(card.id);

    if (wordDetails[card.word]) {
      return; // already cached
    }

    setLoadingWord(card.word);
    try {
      const res = await fetch("/api/generate-word-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: card.word,
          pos: card.pos,
          translation: card.translation,
          example: card.example,
          exampleTranslation: card.exampleTranslation
        })
      });

      if (!res.ok) throw new Error("取得單字解析失敗");
      const data = await res.json();
      
      const updatedDetails = { ...wordDetails, [card.word]: data };
      setWordDetails(updatedDetails);
      onUpdateSet(set.id, set.title, set.icon, set.cards, { wordDetails: updatedDetails });
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingWord(null);
    }
  };

  // Send message to grounded AI Chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAiReplying) return;

    const userMsg = {
      id: `chat-user-${Date.now()}`,
      sender: "user" as const,
      text: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setIsAiReplying(true);

    try {
      const res = await fetch("/api/notebook-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcesContent: set.sourceText || "",
          message: userMsg.text,
          history: chatMessages.slice(-8) // Send recent history as context
        })
      });

      if (!res.ok) {
        throw new Error("智慧助理忙碌中，請稍候重試");
      }

      const data = await res.json();
      const aiReplyMsg = {
        id: `chat-ai-${Date.now()}`,
        sender: "ai" as const,
        text: data.reply || "我已經記錄了您的看法，還有什麼想了解的嗎？",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const finalMessages = [...updatedMessages, aiReplyMsg];
      setChatMessages(finalMessages);
      
      // Persist history to local storage state
      onUpdateSet(set.id, set.title, set.icon, set.cards, { chatMessages: finalMessages });
    } catch (err: any) {
      const errMsg = {
        id: `chat-err-${Date.now()}`,
        sender: "ai" as const,
        text: `⚠️ 抱歉，助理連線遇到問題：${err.message || "請檢查您的網路狀態並重新嘗試。"}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, errMsg]);
    } finally {
      setIsAiReplying(false);
    }
  };

  // Re-generate / Refresh Study guide helper
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefreshWorkspace = async () => {
    if (!set.sourceText) return;
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/generate-notebook-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "text",
          text: set.sourceText
        })
      });

      if (!res.ok) throw new Error("重新分析失敗");
      const data = await res.json();
      
      onUpdateSet(set.id, data.title || set.title, data.icon || set.icon, set.cards, {
        studyGuideSummary: data.summary,
        studyGuideExamSkills: data.examSkills, // Update examSkills field
        studyGuideGrammar: undefined, // Clear old grammar
        studyGuideFaqs: data.faqs
      });

      alert("🎉 智慧統整工作區內容重新整理成功！");
    } catch (err: any) {
      alert(`更新失敗: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-0 md:p-4"
    >
      <motion.div 
        initial={{ scale: 0.96, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 15 }}
        className="bg-[#FAFBFD] w-full h-full md:max-w-5xl md:h-[88vh] md:rounded-3xl border border-slate-200/80 shadow-2xl overflow-hidden flex flex-col relative"
      >
        {/* Header - Renamed to 智慧統整 */}
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-sm shrink-0 z-10">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 bg-blue-50 border border-blue-200/50 rounded-xl flex items-center justify-center text-xl shadow-sm">
              {set.icon}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-slate-800 text-sm md:text-base tracking-tight truncate max-w-[200px] md:max-w-[350px]">
                  {set.title}
                </h2>
                <span className="text-[10px] bg-blue-50 text-blue-600 font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-0.5 border border-blue-100/30">
                  <Sparkles size={10} className="animate-pulse text-blue-500" />
                  智慧統整
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                Smart Study Workspace • 深度智慧統整專區
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {set.sourceText && (
              <button
                onClick={handleRefreshWorkspace}
                disabled={isRefreshing}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-150 transition-all cursor-pointer mr-1 flex items-center gap-1"
                title="重新生成/刷新導讀"
              >
                {isRefreshing ? (
                  <Loader2 size={13} className="animate-spin text-blue-500" />
                ) : (
                  <RefreshCw size={13} />
                )}
                <span className="hidden md:inline text-[10px] font-bold">重新整理</span>
              </button>
            )}

            <button 
              onClick={onClose}
              className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all border border-slate-200/20 shadow-sm cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Tab Selection Bar (All Tabs Merged to Same Position) */}
        <div className="bg-slate-50 border-b border-slate-150/50 p-2 flex shrink-0 overflow-x-auto gap-1">
          {[
            { id: "briefing", label: "學習導讀與精華", icon: <BookOpen size={13} /> },
            { id: "exam_skills", label: "應考技巧與重點整理", icon: <GraduationCap size={13} /> },
            { id: "cards", label: "核心單字清單", icon: <Layers size={13} />, count: set.cards.length },
            { id: "chat", label: "AI 智慧讀書助理", icon: <MessageSquare size={13} /> },
            { id: "faq", label: "閱讀理解 FAQ", icon: <HelpCircle size={13} />, count: set.studyGuideFaqs?.length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
                activeTab === tab.id 
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200/60" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                  activeTab === tab.id ? "bg-blue-50 text-blue-600" : "bg-slate-200/60 text-slate-500"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Main Spacious Unified Tab Content Pane */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="h-full flex flex-col">
            
            {/* TAB 1: BRIEFING */}
            {activeTab === "briefing" && (
              <div className="p-6 max-w-4xl mx-auto space-y-5 w-full animate-fade-in">
                {set.sourceText && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150/40">
                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">關於本專案來源資料</h4>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed truncate">
                      {set.sourceText}
                    </p>
                  </div>
                )}

                <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed">
                  {set.studyGuideSummary ? (
                    renderMarkdown(set.studyGuideSummary)
                  ) : (
                    <div className="text-center py-20 text-slate-400 space-y-3">
                      <BookOpen size={36} className="mx-auto text-slate-300" />
                      <p className="text-sm font-bold text-slate-600">暫無導讀指南</p>
                      <p className="text-xs text-slate-400">您可以點擊右上角的「重新整理」按鈕，讓 AI 自動產生此來源檔案的深入研讀指南！</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: EXAM TAKING SKILLS (Replacing Grammar) */}
            {activeTab === "exam_skills" && (
              <div className="p-6 max-w-3xl mx-auto space-y-5 w-full animate-fade-in">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-base font-extrabold text-slate-800">應考相關的技巧與重點整理</h3>
                  <p className="text-xs text-slate-400 mt-0.5">針對此單字卡組，AI 動態分析的高頻常規考點、常犯陷阱、及應考記憶祕訣</p>
                </div>

                {set.studyGuideExamSkills && set.studyGuideExamSkills.length > 0 ? (
                  <div className="space-y-4">
                    {set.studyGuideExamSkills.map((skill, idx) => (
                      <div 
                        key={idx} 
                        className="bg-gradient-to-br from-purple-50/20 to-slate-50/50 p-5 rounded-2xl border border-purple-100/30 hover:border-purple-200 transition-all flex gap-3.5 items-start shadow-sm"
                      >
                        <span className="w-6 h-6 bg-purple-100 text-purple-700 font-extrabold text-xs rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="text-xs leading-relaxed text-slate-600 space-y-1">
                          {renderMarkdown(skill)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                    <GraduationCap size={36} className="mx-auto text-slate-300" />
                    <p className="text-xs font-bold text-slate-500">此字組尚未生成應考技巧</p>
                    <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      您可以點擊右上角的「重新整理」按鈕，AI 就會重新解構來源內容，並自動為您提煉出一份「高分應考技巧與記憶祕訣」！
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: EXTENSIVE VOCABULARY DETAILS (Detailed Single card lookups) */}
            {activeTab === "cards" && (
              <div className="p-6 max-w-3xl mx-auto w-full space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">深度核心單字清單</h3>
                    <p className="text-xs text-slate-400 mt-0.5">點擊單字即可展開 AI 深度解析學術字典，查看字根、同義字、衍生詞及考試句型</p>
                  </div>
                  <span className="text-xs bg-blue-50 text-blue-600 font-extrabold px-3 py-1 rounded-full">
                    {set.cards.length} 個單字
                  </span>
                </div>

                {set.cards.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">
                    此專案尚無單字卡，可在卡片管理中加入。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {set.cards.map((card) => {
                      const isExpanded = expandedCardId === card.id;
                      const isWordLoading = loadingWord === card.word;
                      const detail = wordDetails[card.word];

                      return (
                        <div 
                          key={card.id}
                          className={`bg-white border rounded-2xl transition-all overflow-hidden ${
                            isExpanded ? "border-blue-400 shadow-md ring-1 ring-blue-400/15" : "border-slate-200/80 hover:border-slate-350"
                          }`}
                        >
                          {/* Card Summary Line */}
                          <div 
                            onClick={() => handleCardExpand(card)}
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex items-baseline gap-2">
                                <span className="text-sm font-black text-slate-800 font-mono">{card.word}</span>
                                <span className="text-[9px] text-slate-400 font-extrabold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/40 italic">
                                  {card.pos}
                                </span>
                                {detail?.phonetic && (
                                  <span className="text-xs text-slate-400 font-serif font-medium">{detail.phonetic}</span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  speak(card.word);
                                }}
                                className="p-1 hover:bg-slate-150 text-slate-500 hover:text-blue-500 rounded-full transition-colors cursor-pointer"
                                title="朗讀單字"
                              >
                                <Volume2 size={13} />
                              </button>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-blue-600">{card.translation}</span>
                              <ChevronDown 
                                size={14} 
                                className={`text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} 
                              />
                            </div>
                          </div>

                          {/* Expanded Rich Details */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="border-t border-slate-100 bg-slate-50/40"
                              >
                                {isWordLoading ? (
                                  <div className="p-8 text-center flex items-center justify-center gap-2 text-xs text-slate-400">
                                    <Loader2 size={14} className="animate-spin text-blue-500" />
                                    AI 智慧辭典深度解構單字中...
                                  </div>
                                ) : detail ? (
                                  <div className="p-5 space-y-4 text-xs">
                                    
                                    {/* 1. Word Roots Breakdown */}
                                    <div className="bg-purple-50/30 p-3.5 rounded-xl border border-purple-100/50 space-y-2">
                                      <div className="font-extrabold text-purple-800 flex items-center gap-1">
                                        🧬 字根字首字尾拆解
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                                        <div className="bg-white p-2 rounded border border-purple-100/30">
                                          <span className="text-purple-400 font-bold block text-[9px] uppercase">字首 (Prefix)</span>
                                          <span className="font-mono text-slate-700">{detail.wordRoots?.prefix || "無/不適用"}</span>
                                        </div>
                                        <div className="bg-white p-2 rounded border border-purple-100/30">
                                          <span className="text-purple-400 font-bold block text-[9px] uppercase">字根 (Root)</span>
                                          <span className="font-mono text-slate-700 font-bold">{detail.wordRoots?.root || "無"}</span>
                                        </div>
                                        <div className="bg-white p-2 rounded border border-purple-100/30">
                                          <span className="text-purple-400 font-bold block text-[9px] uppercase">字尾 (Suffix)</span>
                                          <span className="font-mono text-slate-700">{detail.wordRoots?.suffix || "無/不適用"}</span>
                                        </div>
                                      </div>
                                      <div className="text-[11px] text-purple-900 bg-white p-2.5 rounded-lg border border-purple-100/50 leading-relaxed font-medium">
                                        <span className="font-bold">語源拆解邏輯：</span> {detail.wordRoots?.breakdown}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {/* 2. Synonyms & Variations */}
                                      <div className="space-y-3.5">
                                        {/* Variations */}
                                        <div className="bg-white p-3.5 rounded-xl border border-slate-150/80 space-y-1.5 shadow-sm">
                                          <div className="font-extrabold text-slate-700">🔄 不同詞性的派生單字</div>
                                          <div className="space-y-1">
                                            {detail.variations && detail.variations.length > 0 ? (
                                              detail.variations.map((v, i) => (
                                                <div key={i} className="flex justify-between items-baseline font-medium bg-slate-50 p-1.5 rounded text-[11px]">
                                                  <span className="font-mono text-slate-700 font-bold">{v.word} <span className="text-[9px] text-slate-400 italic font-normal">({v.pos})</span></span>
                                                  <span className="text-slate-500">{v.meaning}</span>
                                                </div>
                                              ))
                                            ) : (
                                              <span className="text-slate-400">無其它常見衍生詞。</span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Synonyms */}
                                        <div className="bg-white p-3.5 rounded-xl border border-slate-150/80 space-y-1.5 shadow-sm">
                                          <div className="font-extrabold text-slate-700">🔗 相同意義的同義字</div>
                                          <div className="space-y-1">
                                            {detail.synonyms && detail.synonyms.length > 0 ? (
                                              detail.synonyms.map((s, i) => (
                                                <div key={i} className="flex justify-between items-baseline bg-slate-50 p-1.5 rounded text-[11px] font-medium">
                                                  <span className="font-mono text-slate-700 font-bold">{s.word}</span>
                                                  <span className="text-slate-500">{s.meaning}</span>
                                                </div>
                                              ))
                                            ) : (
                                              <span className="text-slate-400">無相似同義詞。</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* 3. Usage & Collocations */}
                                      <div className="space-y-3.5">
                                        {/* Usage Notes */}
                                        <div className="bg-white p-3.5 rounded-xl border border-slate-150/80 space-y-1.5 h-full shadow-sm">
                                          <div className="font-extrabold text-slate-700">💡 用法說明與慣用搭配</div>
                                          <p className="text-slate-600 leading-relaxed font-medium bg-blue-50/20 p-2.5 rounded-lg border border-blue-100/20 text-[11px]">
                                            {detail.usageNotes}
                                          </p>

                                          {/* Related exam vocabulary */}
                                          {detail.relatedWords && detail.relatedWords.length > 0 && (
                                            <div className="pt-2">
                                              <div className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wide mb-1">
                                                📚 考試相關推薦單字 (Related words)
                                              </div>
                                              <div className="flex flex-wrap gap-1.5">
                                                {detail.relatedWords.map((rw, i) => (
                                                  <span key={i} className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded text-[10px] border border-slate-200/40">
                                                    {rw}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* 4. Practical exam-style examples */}
                                    <div className="bg-white p-4 rounded-xl border border-slate-150/80 space-y-2 shadow-sm">
                                      <div className="font-extrabold text-slate-700">📝 常見考題用法與例句舉例</div>
                                      <div className="space-y-2.5">
                                        {/* Original Example */}
                                        <div className="pl-3 border-l-2 border-blue-500 text-[11px] space-y-0.5 font-medium">
                                          <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.2 rounded font-bold mr-1">課文釋例</span>
                                          <p className="text-slate-800 font-semibold font-mono leading-relaxed">{card.example}</p>
                                          <p className="text-slate-500">{card.exampleTranslation}</p>
                                        </div>

                                        {/* AI Generated examples */}
                                        {detail.examples?.map((ex, i) => (
                                          <div key={i} className="pl-3 border-l-2 border-purple-500 text-[11px] space-y-0.5 font-medium">
                                            <span className="text-[9px] bg-purple-50 text-purple-600 px-1 py-0.2 rounded font-bold mr-1">情境擴充 {i+1}</span>
                                            <p className="text-slate-800 font-semibold font-mono leading-relaxed">{ex.sentence}</p>
                                            <p className="text-slate-500">{ex.translation}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                  </div>
                                ) : (
                                  <div className="p-4 text-center text-xs text-rose-500 font-bold">
                                    加載解析失敗，請收合後再點擊展開一次。
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: CHAT ASSISTANT (Spacious Full screen layout) */}
            {activeTab === "chat" && (
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
                {/* Chat Message Scroll Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="max-w-2xl mx-auto space-y-4">
                    {chatMessages.map((msg) => {
                      const isAi = msg.sender === "ai";
                      return (
                        <div 
                          key={msg.id}
                          className={`flex ${isAi ? "justify-start" : "justify-end"} animate-fade-in`}
                        >
                          <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm border ${
                            isAi 
                              ? "bg-white border-slate-150/80 text-slate-700 rounded-tl-none" 
                              : "bg-blue-600 border-blue-600 text-white rounded-tr-none"
                          }`}>
                            <div className="space-y-1.5 whitespace-pre-line">
                              {msg.text}
                            </div>
                            
                            <div className={`text-[8px] font-bold mt-1.5 text-right ${isAi ? "text-slate-400" : "text-blue-200"}`}>
                              {msg.timestamp}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {isAiReplying && (
                      <div className="flex justify-start animate-pulse">
                        <div className="bg-white border border-slate-150 rounded-2xl rounded-tl-none px-4 py-3 text-xs text-slate-400 flex items-center gap-1.5 shadow-sm">
                          <Loader2 size={12} className="animate-spin text-blue-500" />
                          助理思考文章內容中...
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                </div>

                {/* Grounded Prompt Suggestions */}
                <div className="border-t border-slate-100 bg-white/70 py-2 shrink-0">
                  <div className="max-w-2xl mx-auto px-6 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setChatInput("請幫我造兩個有創意、關於這篇文章主題的英文例句。")}
                      className="text-[9px] bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 font-bold px-3 py-1.5 rounded-full border border-slate-200/60 transition-all cursor-pointer shadow-sm"
                    >
                      📝 幫我用主題造句
                    </button>
                    <button
                      onClick={() => setChatInput("文章裡有什麼高難度、但實用的片語或慣用語嗎？")}
                      className="text-[9px] bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 font-bold px-3 py-1.5 rounded-full border border-slate-200/60 transition-all cursor-pointer shadow-sm"
                    >
                      💡 推薦文章內實用片語
                    </button>
                    <button
                      onClick={() => setChatInput("請根據本文出 2 題英文單字選擇題來考考我！")}
                      className="text-[9px] bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 font-bold px-3 py-1.5 rounded-full border border-slate-200/60 transition-all cursor-pointer shadow-sm"
                    >
                      🎯 給我進行隨堂小測驗
                    </button>
                  </div>
                </div>

                {/* Send Box */}
                <form 
                  onSubmit={handleSendMessage}
                  className="bg-white border-t border-slate-150 p-4 shrink-0 shadow-md"
                >
                  <div className="max-w-2xl mx-auto flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="問我任何關於這篇來源文獻的英文疑難雜症..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={isAiReplying}
                      className="flex-1 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-blue-500 text-slate-700"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || isAiReplying}
                      className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-100 text-white disabled:text-slate-350 rounded-xl transition-all shadow-md shadow-blue-50/40 cursor-pointer active:scale-95 shrink-0"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 5: FAQ READINGS */}
            {activeTab === "faq" && (
              <div className="p-6 max-w-2xl mx-auto space-y-4 w-full animate-fade-in">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-base font-extrabold text-slate-800">來源文章理解 FAQ 測驗</h3>
                  <p className="text-xs text-slate-400 mt-0.5">點選下方問題來檢驗自己的英文理解能力</p>
                </div>

                {set.studyGuideFaqs && set.studyGuideFaqs.length > 0 ? (
                  <div className="space-y-3">
                    {set.studyGuideFaqs.map((faq, idx) => {
                      const isExpanded = expandedFaqIdx === idx;
                      return (
                        <div 
                          key={idx}
                          className="bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all duration-200 hover:border-slate-350"
                        >
                          <button
                            onClick={() => setExpandedFaqIdx(isExpanded ? null : idx)}
                            className="w-full px-5 py-4 text-left flex items-center justify-between gap-3 font-bold text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex gap-2.5 items-start">
                              <span className="text-blue-500 shrink-0 font-extrabold">Q{idx + 1}.</span>
                              <span>{faq.question}</span>
                            </div>
                            <ChevronRight 
                              size={14} 
                              className={`text-slate-400 shrink-0 transition-transform ${isExpanded ? "transform rotate-90" : ""}`} 
                            />
                          </button>

                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                              >
                                <div className="px-5 pb-5 pt-1 text-xs text-slate-500 leading-relaxed border-t border-slate-50 bg-slate-50/50">
                                  <div className="flex gap-2.5 items-start font-medium text-slate-600">
                                    <span className="text-emerald-500 shrink-0 font-extrabold">A.</span>
                                    <div className="space-y-2">
                                      <p>{faq.answer}</p>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                    <HelpCircle size={36} className="mx-auto text-slate-300" />
                    <p className="text-xs font-bold text-slate-500">暫無 FAQ 閱讀理解問題</p>
                    <p className="text-[11px] text-slate-400">透過 AI 智慧重新整理，即可產生專屬本文的閱讀測驗與問題解碼！</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
