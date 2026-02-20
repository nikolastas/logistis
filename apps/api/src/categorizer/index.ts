import Fuse from "fuse.js";
import OpenAI from "openai";
import categoriesData from "./categories.json";

const categories = categoriesData.categories as Array<{
  id: string;
  name: string;
  keywords?: string[];
  subcategories?: Array<{ id: string; name: string; keywords?: string[] }>;
  excludeFromSpending?: boolean;
}>;

const UNCATEGORIZED_ID = "uncategorized";

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

const fuse = new Fuse(
  categories.filter((c) => c.id !== UNCATEGORIZED_ID),
  {
    keys: ["name", "keywords"],
    includeScore: true,
    threshold: 0.4,
    getFn: (obj, path) => {
      const key = Array.isArray(path) ? path[0] : path;
      if (key === "keywords") {
        return (obj.keywords || []).join(" ");
      }
      return (obj as Record<string, unknown>)[key] as string;
    },
  }
);

function keywordMatch(description: string): string | null {
  const norm = normalize(description);
  for (const cat of categories) {
    if (cat.id === UNCATEGORIZED_ID) continue;
    const words = (cat.keywords || []).flatMap((k) => k.split(/\s+/));
    for (const w of words) {
      if (w.length < 3) continue;
      const nw = normalize(w);
      if (norm.includes(nw)) return cat.id;
    }
  }
  return null;
}

function fuzzyMatch(description: string): string | null {
  const norm = normalize(description);
  const results = fuse.search(norm);
  if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.5) {
    return results[0].item.id;
  }
  return null;
}

async function openaiMatch(description: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const openai = new OpenAI({ apiKey: key });
  const catList = categories
    .filter((c) => c.id !== UNCATEGORIZED_ID)
    .map((c) => `${c.id}: ${c.name}`)
    .join(", ");

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You categorize bank transactions. Reply with ONLY the category id from this list: ${catList}. If unsure, reply "uncategorized".`,
        },
        {
          role: "user",
          content: `Transaction: "${description}"`,
        },
      ],
      max_tokens: 20,
    });
    const text = res.choices[0]?.message?.content?.trim().toLowerCase();
    if (!text) return null;
    const id = categories.find((c) => c.id === text)?.id;
    return id || UNCATEGORIZED_ID;
  } catch {
    return null;
  }
}

export async function categorize(description: string): Promise<string> {
  const kw = keywordMatch(description);
  if (kw) return kw;

  const fuzzy = fuzzyMatch(description);
  if (fuzzy) return fuzzy;

  const ai = await openaiMatch(description);
  if (ai) return ai;

  return UNCATEGORIZED_ID;
}

export function getCategories(): typeof categories {
  return categories;
}

export function getCategoryById(id: string): (typeof categories)[0] | { id: string; name: string } | undefined {
  for (const c of categories) {
    if (c.id === id) return c;
    const sub = c.subcategories?.find((s) => s.id === id);
    if (sub) return sub;
  }
  return undefined;
}

export function isExcludedFromSpending(categoryId: string): boolean {
  const cat = categories.find((c) => c.id === categoryId);
  if (cat && "excludeFromSpending" in cat && cat.excludeFromSpending) return true;
  if (categoryId.startsWith("transfer/")) return true;
  return false;
}
