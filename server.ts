import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Helper to initialize Gemini
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// Helper to generate content with exponential backoff retry and fallback models if quota is exhausted or unavailable
const generateContentWithRetry = async (ai: GoogleGenAI, params: any, maxAttempts = 3, initialDelayMs = 1500) => {
  // Define fallback models to try if the primary model is rate limited or unavailable
  const requestedModel = params.model || "gemini-3.5-flash";
  
  // Under the free tier, gemini-3.5-flash has a very strict 20 requests/day limit.
  // We prioritize gemini-3.1-flash-lite as the first candidate to avoid early quota exhaustion,
  // and keep other models as reliable fallbacks.
  const modelCandidates = (requestedModel === "gemini-3.5-flash")
    ? ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"]
    : [requestedModel, "gemini-3.1-flash-lite", "gemini-flash-latest"];

  let lastError: any = null;

  for (const currentModel of modelCandidates) {
    let delay = initialDelayMs;
    console.log(`Attempting generation with model: ${currentModel}`);
    
    // Create a copy of params to avoid mutating original
    const currentParams = {
      ...params,
      model: currentModel
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await ai.models.generateContent(currentParams);
      } catch (error: any) {
        lastError = error;
        
        const errorMessage = error.message || "";
        const errorStr = typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error);
        
        // Check for 429 quota, RESOURCE_EXHAUSTED, or 503 unavailable
        const isQuotaExhausted = 
          errorMessage.includes("429") || 
          errorMessage.includes("quota") || 
          errorMessage.includes("Quota") ||
          errorMessage.includes("RESOURCE_EXHAUSTED") ||
          errorMessage.includes("exhausted") ||
          errorStr.includes("429") ||
          errorStr.includes("quota") ||
          errorStr.includes("RESOURCE_EXHAUSTED");

        const isTransient = 
          isQuotaExhausted ||
          errorMessage.includes("503") || 
          errorMessage.includes("UNAVAILABLE") || 
          errorMessage.includes("high demand") ||
          errorStr.includes("503") ||
          errorStr.includes("UNAVAILABLE");

        const isLastModel = currentModel === modelCandidates[modelCandidates.length - 1];
        const isLastAttempt = attempt === maxAttempts;

        // Log using console.error only if this is the absolute final attempt of the final candidate model
        // to prevent the monitoring system from flagging fully-recovered/transient errors as fatal app errors
        if (isLastModel && isLastAttempt) {
          console.error(`Gemini call with model ${currentModel} (final attempt ${attempt}/${maxAttempts}) failed permanently:`, error);
        } else {
          console.warn(`Gemini call with model ${currentModel} (attempt ${attempt}/${maxAttempts}) encountered an error (will try fallback/retry): ${errorMessage}`);
        }

        // If it's a quota issue, don't wait for other attempts on this model, immediately try the next fallback model!
        if (isQuotaExhausted) {
          console.warn(`Quota exhausted or rate limited on ${currentModel}. Switching to next fallback model immediately.`);
          break; // break the attempt loop to move to the next candidate model
        }

        if (isTransient && attempt < maxAttempts) {
          console.warn(`Transient error on ${currentModel}. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
        } else {
          // Non-transient error or max attempts reached, let's try the next model candidate
          break;
        }
      }
    }
  }

  // If we got here, all candidates failed
  throw lastError || new Error("Failed to generate content from Gemini after trying fallback models and multiple retry attempts.");
};

// API Route: Generate Card Details (translation, POS, example)
app.post("/api/generate-card-details", async (req, res) => {
  try {
    const { word, customTranslation, customPos, customExample } = req.body;
    if (!word || typeof word !== "string" || !word.trim()) {
      return res.status(400).json({ error: "Word is required" });
    }

    const ai = getGeminiClient();
    
    // Construct instructions based on what's missing
    const prompt = `You are a professional vocabulary tutor.
Please analyze the word: "${word.trim()}".
Provide its Chinese translation (Traditional Chinese, suitable for Taiwan/Hong Kong usage), part of speech, and a simple but natural example sentence containing this word with its Traditional Chinese translation.

If the user provided custom values, incorporate or respect them:
- Custom Translation: ${customTranslation || "None"}
- Custom POS: ${customPos || "None"}
- Custom Example: ${customExample || "None"}
`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translation: { type: Type.STRING, description: "Traditional Chinese translation of the word" },
            pos: { type: Type.STRING, description: "Part of speech of the word, e.g., n., v., adj., adv." },
            example: { type: Type.STRING, description: "A simple English example sentence featuring the word" },
            exampleTranslation: { type: Type.STRING, description: "Traditional Chinese translation of the example sentence" }
          },
          required: ["translation", "pos", "example", "exampleTranslation"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response from Gemini");
    }

    const data = JSON.parse(resultText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Error generating card details:", error);
    res.status(500).json({ error: error.message || "Failed to generate card details" });
  }
});

// API Route: Generate Forgotten Details (collocations, parts of speech variation, synonyms)
app.post("/api/generate-forgotten-details", async (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== "string" || !word.trim()) {
      return res.status(400).json({ error: "Word is required" });
    }

    const ai = getGeminiClient();
    const prompt = `You are an elite lexicographer and English teacher.
The user forgot the word "${word.trim()}" in their flashcards review.
Please generate an engaging, extremely detailed and clear study sheet in Traditional Chinese for this word, containing:
1. Phonetic spelling or pronunciation guide.
2. Common usages, collocations, or phrases with their Chinese translations.
3. Related word forms or variations with different parts of speech, and their meanings.
4. Synonyms (similar meaning words) with their Chinese meanings.
5. A brief, elegant, clear explanation of nuances, differences from similar words, and helpful usage tips in Traditional Chinese.
`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            phonetic: { type: Type.STRING, description: "Phonetic spelling or symbol (IPA or KK phonetic symbol)" },
            usages: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of common usages, collocations, or phrases with Traditional Chinese translations. e.g., 'apply for (申請)'"
            },
            variations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pos: { type: Type.STRING, description: "Part of speech of this variation, e.g., noun, verb, adjective" },
                  word: { type: Type.STRING, description: "The varied word form" },
                  meaning: { type: Type.STRING, description: "Traditional Chinese meaning of this variation" }
                },
                required: ["pos", "word", "meaning"]
              },
              description: "Related word forms with different parts of speech"
            },
            synonyms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING, description: "Synonym word" },
                  meaning: { type: Type.STRING, description: "Traditional Chinese meaning of the synonym" }
                },
                required: ["word", "meaning"]
              },
              description: "Synonyms with similar meanings"
            },
            detailedExplanation: { type: Type.STRING, description: "Nuances, differences from other words, and usage tips explained in Traditional Chinese" }
          },
          required: ["phonetic", "usages", "variations", "synonyms", "detailedExplanation"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response from Gemini");
    }

    const data = JSON.parse(resultText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Error generating detailed explanations:", error);
    res.status(500).json({ error: error.message || "Failed to generate detailed explanations" });
  }
});

// API Route: Generate Card Set or Words from Source (File, Image, URL)
app.post("/api/generate-set-from-source", async (req, res) => {
  try {
    const { sourceType, text, image, images, mimeType, url } = req.body;
    const ai = getGeminiClient();

    let contentToAnalyze = "";
    let imageParts: any[] = [];

    if (sourceType === "text") {
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text content is required for text import" });
      }
      contentToAnalyze = text;
    } else if (sourceType === "url") {
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required for URL import" });
      }
      try {
        const fetchRes = await fetch(url);
        if (!fetchRes.ok) {
          throw new Error(`Failed to fetch URL. Status: ${fetchRes.status}`);
        }
        const html = await fetchRes.text();
        contentToAnalyze = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 10000); // Limit length to 10k chars
      } catch (e: any) {
        console.error("URL fetch error:", e);
        return res.status(400).json({ error: `無法抓取該網址內容，請確認網址正確且公開可存取 (${e.message})` });
      }
    } else if (sourceType === "image") {
      let base64Array: string[] = [];
      if (Array.isArray(images)) {
        base64Array = images;
      } else if (image && typeof image === "string") {
        base64Array = [image];
      }

      if (base64Array.length === 0) {
        return res.status(400).json({ error: "Image base64 data is required" });
      }

      imageParts = base64Array.map(imgStr => {
        const base64Data = imgStr.includes("base64,") ? imgStr.split("base64,")[1] : imgStr;
        return {
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: base64Data,
          }
        };
      });
    } else {
      return res.status(400).json({ error: "Invalid sourceType" });
    }

    const systemInstruction = `You are an expert language teacher and curriculum designer.
Analyze the provided source (which could be text, web content, or an image/photo of notes/pages).
Extract between 5 and 15 key English vocabulary words that are important, useful, or prominent in the source.
For each extracted word:
1. Provide its Traditional Chinese translation (suitable for Taiwan/Hong Kong usage).
2. Provide its Part of Speech (POS), e.g., "n.", "v.", "adj.", "adv.".
3. Provide a natural, context-appropriate English example sentence featuring the word.
4. Provide the Traditional Chinese translation of the example sentence.

Also suggest a highly descriptive title (in Traditional Chinese) for this card set and a matching emoji icon based on the source content.
If the content is empty or contains no readable English vocabulary, extract 5 general useful daily words.`;

    const promptText = `Please analyze this content and generate the card set.`;

    let response;
    if (imageParts.length > 0) {
      response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: {
          parts: [...imageParts, { text: promptText }]
        },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Descriptive title for the card set in Traditional Chinese" },
              icon: { type: Type.STRING, description: "A single representative emoji icon" },
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING, description: "The English word" },
                    translation: { type: Type.STRING, description: "Traditional Chinese translation" },
                    pos: { type: Type.STRING, description: "Part of speech, e.g., n., v., adj., adv." },
                    example: { type: Type.STRING, description: "Natural English example sentence" },
                    exampleTranslation: { type: Type.STRING, description: "Traditional Chinese translation of the example" }
                  },
                  required: ["word", "translation", "pos", "example", "exampleTranslation"]
                }
              }
            },
            required: ["title", "icon", "cards"]
          }
        }
      });
    } else {
      response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: `${promptText}\n\nContent:\n${contentToAnalyze}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Descriptive title for the card set in Traditional Chinese" },
              icon: { type: Type.STRING, description: "A single representative emoji icon" },
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING, description: "The English word" },
                    translation: { type: Type.STRING, description: "Traditional Chinese translation" },
                    pos: { type: Type.STRING, description: "Part of speech, e.g., n., v., adj., adv." },
                    example: { type: Type.STRING, description: "Natural English example sentence" },
                    exampleTranslation: { type: Type.STRING, description: "Traditional Chinese translation of the example" }
                  },
                  required: ["word", "translation", "pos", "example", "exampleTranslation"]
                }
              }
            },
            required: ["title", "icon", "cards"]
          }
        }
      });
    }

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response from Gemini");
    }

    const data = JSON.parse(resultText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Error generating set from source:", error);
    res.status(500).json({ error: error.message || "Failed to generate set from source" });
  }
});

// API Route: Generate NotebookLM Study Guide (Summary, Grammar, FAQs, Cards)
app.post("/api/generate-notebook-guide", async (req, res) => {
  try {
    const { sourceType, text, image, images, mimeType, url, detailLevel } = req.body;
    const ai = getGeminiClient();

    let contentToAnalyze = "";
    let imageParts: any[] = [];

    if (sourceType === "text") {
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text content is required for text import" });
      }
      contentToAnalyze = text;
    } else if (sourceType === "url") {
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required for URL import" });
      }
      try {
        const fetchRes = await fetch(url);
        if (!fetchRes.ok) {
          throw new Error(`Failed to fetch URL. Status: ${fetchRes.status}`);
        }
        const html = await fetchRes.text();
        contentToAnalyze = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 10000); // Limit length to 10k chars
      } catch (e: any) {
        console.error("URL fetch error:", e);
        return res.status(400).json({ error: `無法抓取該網址內容，請確認網址正確且公開可存取 (${e.message})` });
      }
    } else if (sourceType === "image") {
      let base64Array: string[] = [];
      if (Array.isArray(images)) {
        base64Array = images;
      } else if (image && typeof image === "string") {
        base64Array = [image];
      }

      if (base64Array.length === 0) {
        return res.status(400).json({ error: "Image base64 data is required" });
      }

      imageParts = base64Array.map(imgStr => {
        const base64Data = imgStr.includes("base64,") ? imgStr.split("base64,")[1] : imgStr;
        return {
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: base64Data,
          }
        };
      });
    } else {
      return res.status(400).json({ error: "Invalid sourceType" });
    }

    let cardCountText = "30 key vocabulary words representing a standard, highly informative extraction";
    if (detailLevel === "low") {
      cardCountText = "a concise selection of essential vocabulary (approx. 15% ratio)";
    } else if (detailLevel === "high") {
      cardCountText = "a comprehensive selection of key vocabulary (approx. 50% ratio)";
    } else if (detailLevel === "medium") {
      cardCountText = "a balanced selection of key vocabulary (approx. 30% ratio)";
    }

    const systemInstruction = `You are an expert language teacher, educational psychologist, and learning guide creator.
Analyze the provided source content (which could be text, web content, or OCR text from an image).
Create a complete, beautiful, and highly educational NotebookLM-style study experience for a language learner.

You MUST return a JSON object with the following fields:
1. "title": A descriptive, catchy study notebook title (in Traditional Chinese) based on the content (e.g. "BBC 新聞：人工智慧的倫理探討").
2. "icon": A single representative emoji icon (e.g. "🤖", "🌍").
3. "summary": A high-quality, comprehensive study guide/briefing document written in Traditional Chinese. It should summarize the core article content, discuss its main themes, and provide helpful reading/learning strategies in beautiful markdown with headings, bold text, lists, and quote blocks.
4. "examSkills": An array of 3-5 crucial exam-related tips, common pitfalls, memory hacks, or high-probability test patterns in Traditional Chinese, specifically related to the vocabulary found in this source content and how they are commonly tested in English exams (e.g. TOEFL, TOEIC, GEPT, etc.).
5. "faqs": An array of 3-5 high-quality reading comprehension Q&A pairs (in Traditional Chinese) about the source document, helping the user test and lock down their understanding of the material.
6. "cards": An array of ${cardCountText} from the text. Each word contains:
   - "word": The English word
   - "translation": Traditional Chinese translation
   - "pos": Part of speech (e.g., n., v., adj., adv.)
   - "example": A natural English example sentence containing the word
   - "exampleTranslation": Traditional Chinese translation of the example sentence.

If the content is empty or contains no readable English vocabulary, create a general useful daily study guide.`;

    const promptText = `Please analyze this source content and generate the full NotebookLM Study Guide and flashcards.`;

    let response;
    if (imageParts.length > 0) {
      response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: {
          parts: [...imageParts, { text: promptText }]
        },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Descriptive title in Traditional Chinese" },
              icon: { type: Type.STRING, description: "A single emoji icon" },
              summary: { type: Type.STRING, description: "Detailed summary and briefing in markdown" },
              examSkills: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of exam prep skills, tips, traps or key points in Traditional Chinese"
              },
              faqs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING }
                  },
                  required: ["question", "answer"]
                }
              },
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    translation: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    example: { type: Type.STRING },
                    exampleTranslation: { type: Type.STRING }
                  },
                  required: ["word", "translation", "pos", "example", "exampleTranslation"]
                }
              }
            },
            required: ["title", "icon", "summary", "examSkills", "faqs", "cards"]
          }
        }
      });
    } else {
      response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: `${promptText}\n\nContent:\n${contentToAnalyze}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Descriptive title in Traditional Chinese" },
              icon: { type: Type.STRING, description: "A single emoji icon" },
              summary: { type: Type.STRING, description: "Detailed summary and briefing in markdown" },
              examSkills: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of exam prep skills, tips, traps or key points in Traditional Chinese"
              },
              faqs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING }
                  },
                  required: ["question", "answer"]
                }
              },
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    translation: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    example: { type: Type.STRING },
                    exampleTranslation: { type: Type.STRING }
                  },
                  required: ["word", "translation", "pos", "example", "exampleTranslation"]
                }
              }
            },
            required: ["title", "icon", "summary", "examSkills", "faqs", "cards"]
          }
        }
      });
    }

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response from Gemini");
    }

    const data = JSON.parse(resultText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Error generating notebook guide:", error);
    res.status(500).json({ error: error.message || "Failed to generate Notebook guide" });
  }
});

// API Route: NotebookLM Grounded Interactive Chat Assistant
app.post("/api/notebook-chat", async (req, res) => {
  try {
    const { sourcesContent, message, history } = req.body;
    const ai = getGeminiClient();

    const systemInstruction = `You are a helpful, professional AI Study Assistant inside a language learning NotebookLM workspace.
The user has uploaded some study materials (sources) which are provided below.
Your role is to answer the user's questions, explain grammar points, clarify word usages, translate sentences/paragraphs, or quiz them, strictly grounding your answers on the provided source content.
If the user asks something completely unrelated to the sources, gently guide them back to studying the uploaded documents, but still provide a brief helpful answer.
Keep your tone encouraging, highly academic, and precise.
Use Traditional Chinese for your explanations unless asked to explain in English.

Source Material Contents:
${sourcesContent || "No specific source text uploaded. Answer based on general language learning best practices."}
`;

    // Format chat history for Gemini API
    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      history.forEach((msg: any) => {
        contents.push({
          role: msg.sender === "user" ? "user" : "model",
          parts: [{ text: msg.text }]
        });
      });
    }
    
    // Add the current user query
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction,
      }
    });

    const reply = response.text || "抱歉，我現在無法回答這個問題，請再試一次。";
    res.json({ reply });
  } catch (error: any) {
    console.error("Error in Notebook Chat:", error);
    res.status(500).json({ error: error.message || "Failed to process chat" });
  }
});

// API Route: Generate Quiz based on Flashcards
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { cards, difficulty, count, quizType } = req.body;
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: "Cards are required to generate a quiz" });
    }

    const ai = getGeminiClient();
    const wordList = cards.map((c: any) => `Word: "${c.word}", translation: "${c.translation}", POS: "${c.pos}"`).join("\n");

    const systemInstruction = `You are an elite, highly engaging language educator specializing in English test design (TOEIC, TOEFL, IELTS, GEPT).
You will generate an English vocabulary quiz based on the provided flashcard list:
${wordList}

Difficulty Level: ${difficulty || "Medium"}
Number of items requested: ${count || 5}
Quiz Format: ${quizType} ('選擇題' | '填充題' | '文章挖空' | '單字配對')

Instructions depending on Quiz Format:
1. For '選擇題' (Multiple Choice):
   - Generate ${count} multiple-choice questions focusing on the vocabulary words.
   - Each question must have a clear question sentence (in English), 4 multiple-choice 'options', a 'correctAnswer' matching exactly one option, and the 'word' being tested.
   - Return 'questions' array. Keep 'passage' as an empty string.

2. For '填充題' (Fill in the blanks):
   - Generate ${count} sentences, each missing one of the target vocabulary words (represent the blank with "________").
   - Give a hint in Traditional Chinese inside the question (e.g. "She needs to ________ (創新) to stay ahead.").
   - Keep 'options' empty. 'correctAnswer' should be the exact correct English word, and 'word' should be that word.
   - Return 'questions' array. Keep 'passage' as an empty string.

3. For '文章挖空' (Cloze / Text gap-filling):
   - Generate a single, short, cohesive English reading passage (about 1-2 paragraphs) containing ${count} blank slots represented as [1], [2], ... up to [${count}].
   - The words missing from [1], [2] etc. must be from the provided vocabulary list.
   - Return 'passage' as this reading text.
   - Return 'questions' array with ${count} items, where each question corresponds to one gap in sequence (e.g., Question 1 asks for slot [1]). Each question must have 4 multiple-choice 'options' (consisting of vocabulary words or close distractors), a 'correctAnswer', and the corresponding 'word' being tested.

4. For '單字配對' (Word Matching):
   - Generate ${count} pairs of words and their corresponding Chinese definitions.
   - Return 'matchingPairs' array containing word-definition pairs. Keep 'questions' array empty, and 'passage' as empty string.

All explanations, instructions, and hint texts must be written in Traditional Chinese. Keep the tone professional, educational, and encouraging. All questions in 'questions' array MUST have a 'word' field specifying which English vocabulary word from the flashcards is being tested.`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: `Generate a high-quality ${quizType} quiz with ${count} questions at ${difficulty} difficulty.`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            passage: { type: Type.STRING, description: "Reading text with [1], [2] gaps. Only used for Cloze tests. Empty otherwise." },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING, description: "Question text or sentence with blank" },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "4 choices (e.g. ['A) word1', 'B) word2'...]). Leave empty for fill-in-blanks."
                  },
                  correctAnswer: { type: Type.STRING, description: "The correct option or correct fill-in value" },
                  explanation: { type: Type.STRING, description: "Detailed explanation of why this is correct, in Traditional Chinese" },
                  word: { type: Type.STRING, description: "The specific English vocabulary word from the flashcards list that this question is testing" }
                },
                required: ["id", "question", "correctAnswer", "explanation", "word"]
              }
            },
            matchingPairs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING, description: "The English word" },
                  definition: { type: Type.STRING, description: "Traditional Chinese translation/definition of the word" }
                },
                required: ["word", "definition"]
              },
              description: "Matched pairs. Only used for Word Matching. Empty otherwise."
            }
          },
          required: ["passage", "questions", "matchingPairs"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response from Gemini");
    }

    const data = JSON.parse(resultText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Error generating quiz:", error);
    res.status(500).json({ error: error.message || "Failed to generate quiz" });
  }
});

// API Route: Generate Detailed Vocabulary analysis (Synonyms, variations, roots, examples)
app.post("/api/generate-word-detail", async (req, res) => {
  try {
    const { word, pos, translation, example, exampleTranslation } = req.body;
    if (!word || typeof word !== "string" || !word.trim()) {
      return res.status(400).json({ error: "Word is required" });
    }

    const ai = getGeminiClient();
    const prompt = `You are a world-class lexicographer, etymologist, and English professor.
Please generate an incredibly comprehensive, highly structured, and beautiful masterclass study sheet in Traditional Chinese for the English word: "${word.trim()}".
Current known details (use as basis/context):
- Part of speech: ${pos || "unknown"}
- Translation: ${translation || "unknown"}
- Example: ${example || "none"}
- Example Translation: ${exampleTranslation || "none"}

Please generate:
1. Phonetic spelling (IPA or KK).
2. "variations": List of different word forms / parts of speech derivatives (e.g., verb, noun, adjective, adverb forms) with their Chinese meanings.
3. "synonyms": Synonyms with their specific Chinese meanings.
4. "usageNotes": Helpful explanation of how this word is commonly used, key collocations, prepositions, and specific nuances in Traditional Chinese.
5. "examples": 2-3 additional high-quality, practical English example sentences with their Traditional Chinese translations.
6. "wordRoots": Breakdown of the word's morphology, explaining:
   - "prefix": Prefix meaning (if applicable, else empty/N/A)
   - "root": Root word meaning
   - "suffix": Suffix meaning (if applicable)
   - "breakdown": Step-by-step morphological explanation showing how the parts combine to form the current meaning.
7. "relatedWords": An array of other English words derived from the same root or highly related in exams (with Chinese definitions).

Ensure all explanations and breakdowns are presented in a very organized, structured, and easy-to-read Traditional Chinese format.`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            phonetic: { type: Type.STRING, description: "Phonetic spelling, e.g. /ˈɪn.ə.veɪt/" },
            variations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pos: { type: Type.STRING, description: "Part of speech, e.g., adj, noun, verb" },
                  word: { type: Type.STRING, description: "The varied word form" },
                  meaning: { type: Type.STRING, description: "Traditional Chinese translation" }
                },
                required: ["pos", "word", "meaning"]
              }
            },
            synonyms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING, description: "Synonym word" },
                  meaning: { type: Type.STRING, description: "Traditional Chinese meaning" }
                },
                required: ["word", "meaning"]
              }
            },
            usageNotes: { type: Type.STRING, description: "Detailed explanation of collocations, usage tips, and grammatical context in Traditional Chinese" },
            examples: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sentence: { type: Type.STRING },
                  translation: { type: Type.STRING }
                },
                required: ["sentence", "translation"]
              }
            },
            wordRoots: {
              type: Type.OBJECT,
              properties: {
                prefix: { type: Type.STRING },
                root: { type: Type.STRING },
                suffix: { type: Type.STRING },
                breakdown: { type: Type.STRING, description: "Traditional Chinese morphological breakdown" }
              },
              required: ["prefix", "root", "suffix", "breakdown"]
            },
            relatedWords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Related vocabulary words with their Chinese meanings, e.g. 'renovate (翻修)'"
            }
          },
          required: ["word", "phonetic", "variations", "synonyms", "usageNotes", "examples", "wordRoots", "relatedWords"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response from Gemini");
    }

    const data = JSON.parse(resultText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Error generating word details:", error);
    res.status(500).json({ error: error.message || "Failed to generate word details" });
  }
});

// Serve static assets or mount Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
