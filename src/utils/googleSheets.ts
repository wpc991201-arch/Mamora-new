import { FlashcardSet, DailyProgress } from "../types";

/**
 * Searches Google Drive for a spreadsheet named "NotebookLM 智慧單字學習庫".
 * If not found, creates a new one.
 * Returns the spreadsheet ID.
 */
export async function findOrCreateSpreadsheet(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    "name = 'NotebookLM 智慧單字學習庫' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
  );
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  try {
    const searchRes = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!searchRes.ok) {
      throw new Error(`Google Drive API search failed with status: ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // Spreadsheet not found, create a new one
    const createUrl = "https://sheets.googleapis.com/v4/spreadsheets";
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          title: "NotebookLM 智慧單字學習庫",
        },
      }),
    });

    if (!createRes.ok) {
      throw new Error(`Google Sheets API creation failed with status: ${createRes.status}`);
    }

    const newSpreadsheet = await createRes.json();
    return newSpreadsheet.spreadsheetId;
  } catch (error) {
    console.error("Error finding or creating spreadsheet:", error);
    throw error;
  }
}

/**
 * Syncs the card sets and progress to the given spreadsheet.
 * Creates the required tabs if they do not exist, clears previous content,
 * and updates them with the latest data.
 */
export async function syncSetsToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  sets: FlashcardSet[],
  dailyProgress: DailyProgress[]
): Promise<void> {
  // 1. Fetch spreadsheet metadata to check available tabs
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metaRes = await fetch(metaUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to fetch spreadsheet metadata: ${metaRes.status}`);
  }

  const metadata = await metaRes.json();
  const sheets: any[] = metadata.sheets || [];
  const existingTitles = sheets.map((s: any) => s.properties?.title as string);

  const wordsTabName = "所有單字清單";
  const progressTabName = "學習進度歷史";

  const sheetsToAdd: string[] = [];
  if (!existingTitles.includes(wordsTabName)) sheetsToAdd.push(wordsTabName);
  if (!existingTitles.includes(progressTabName)) sheetsToAdd.push(progressTabName);

  // 2. Create missing sheets
  if (sheetsToAdd.length > 0) {
    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const requests = sheetsToAdd.map((title) => ({
      addSheet: {
        properties: {
          title,
        },
      },
    }));

    const addRes = await fetch(batchUpdateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (!addRes.ok) {
      throw new Error(`Failed to create spreadsheet sheets: ${addRes.status}`);
    }
  }

  // 3. Clear existing ranges to avoid residual data
  const clearPromises = [wordsTabName, progressTabName].map(async (tabName) => {
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      tabName + "!A1:Z5000"
    )}:clear`;
    return fetch(clearUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  });

  await Promise.all(clearPromises);

  // 4. Prepare data for "所有單字清單"
  const wordsHeaders = [
    "字卡群組",
    "單字",
    "詞性",
    "中文翻譯",
    "學習狀態",
    "下次複習日期",
    "複習間隔(天)",
    "英文例句",
    "例句翻譯",
  ];

  const wordsValues: any[][] = [wordsHeaders];
  sets.forEach((set) => {
    set.cards.forEach((card) => {
      wordsValues.push([
        set.title || "未命名群組",
        card.word || "",
        card.pos || "",
        card.translation || "",
        card.status || "learning",
        card.nextReviewDate || "",
        card.intervalDays || 1,
        card.example || "",
        card.exampleTranslation || "",
      ]);
    });
  });

  // 5. Prepare data for "學習進度歷史"
  const progressHeaders = ["日期", "已記住單字量", "已忘記單字量", "總複習次數"];
  const progressValues: any[][] = [progressHeaders];
  dailyProgress.forEach((p) => {
    progressValues.push([p.date, p.remembered, p.forgotten, p.remembered + p.forgotten]);
  });

  // 6. Write values to "所有單字清單"
  const writeWordsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    wordsTabName + "!A1"
  )}?valueInputOption=USER_ENTERED`;

  const writeWordsRes = await fetch(writeWordsUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range: `${wordsTabName}!A1`,
      majorDimension: "ROWS",
      values: wordsValues,
    }),
  });

  if (!writeWordsRes.ok) {
    throw new Error(`Failed to write words list data to Google Sheets: ${writeWordsRes.status}`);
  }

  // 7. Write values to "學習進度歷史"
  const writeProgressUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    progressTabName + "!A1"
  )}?valueInputOption=USER_ENTERED`;

  const writeProgressRes = await fetch(writeProgressUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range: `${progressTabName}!A1`,
      majorDimension: "ROWS",
      values: progressValues,
    }),
  });

  if (!writeProgressRes.ok) {
    throw new Error(`Failed to write progress history data to Google Sheets: ${writeProgressRes.status}`);
  }
}
