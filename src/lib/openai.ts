import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as {
  openai: OpenAI | undefined;
};

export function getOpenAIClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === "your-openai-api-key-here") {
    throw new Error(
      "OPENAI_API_KEY is not configured. Add your key to the .env file in the project root."
    );
  }
  if (!globalForOpenAI.openai) {
    globalForOpenAI.openai = new OpenAI({ apiKey: key });
  }
  return globalForOpenAI.openai;
}

// Lazy accessor — throws a clear error if key is missing
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAIClient();
    return (client as unknown as Record<string | symbol, unknown>)[prop];
  },
});
