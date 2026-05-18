import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

let client: GoogleGenerativeAI | null = null;

function getClient() {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!client) {
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

/** Lightweight text generation. */
export async function geminiText(prompt: string, system?: string) {
  const model = getClient().getGenerativeModel({
    model: modelName,
    systemInstruction: system,
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

/** Structured JSON output — caller supplies the schema. */
export async function geminiJson<T>(prompt: string, system?: string) {
  const model = getClient().getGenerativeModel({
    model: modelName,
    systemInstruction: system,
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as T;
}

/**
 * Customer fuzzy match — used by booking form before saving.
 * Returns a confidence score [0,1] and which existing customer is the
 * best candidate, plus a reasoning string.
 */
export interface FuzzyMatchInput {
  candidate: {
    name: string;
    phone?: string;
    email?: string;
    taxId?: string;
  };
  existingCustomers: Array<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    taxId?: string;
  }>;
}

export interface FuzzyMatchResult {
  matchedId: string | null;
  confidence: number;
  reason: string;
}

export async function fuzzyMatchCustomer(
  input: FuzzyMatchInput,
): Promise<FuzzyMatchResult> {
  const system =
    "You are a customer dedup specialist for a Thai meeting-room business. " +
    "Account for Thai company aliases (บจก./บริษัท/จำกัด/Co.,Ltd). " +
    "Reply with strict JSON: {matchedId: string|null, confidence: number 0..1, reason: string}.";

  const prompt = JSON.stringify(input);
  return geminiJson<FuzzyMatchResult>(prompt, system);
}
