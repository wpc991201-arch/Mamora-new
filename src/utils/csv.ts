/**
 * Simple CSV parser that handles quotes and multiple columns.
 */
export function parseCSV(text: string): { word: string; translation: string; pos: string; example: string; exampleTranslation: string }[] {
  const result: { word: string; translation: string; pos: string; example: string; exampleTranslation: string }[] = [];
  const lines = text.split(/\r?\n/);
  
  // Detect header
  let hasHeader = false;
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes("word") || firstLine.includes("translation") || firstLine.includes("單字") || firstLine.includes("翻譯")) {
      hasHeader = true;
    }
  }

  const startIdx = hasHeader ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by comma, respecting quotes
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());

    // Extract fields
    const word = cells[0] ? cells[0].replace(/^"|"$/g, '') : "";
    const translation = cells[1] ? cells[1].replace(/^"|"$/g, '') : "";
    const pos = cells[2] ? cells[2].replace(/^"|"$/g, '') : "";
    const example = cells[3] ? cells[3].replace(/^"|"$/g, '') : "";
    const exampleTranslation = cells[4] ? cells[4].replace(/^"|"$/g, '') : "";

    if (word) {
      result.push({
        word,
        translation,
        pos,
        example,
        exampleTranslation
      });
    }
  }

  return result;
}
