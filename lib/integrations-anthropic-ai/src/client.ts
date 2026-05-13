import Anthropic from "@anthropic-ai/sdk";

const useOwnKey = !!process.env.ANTHROPIC_API_KEY;
const useProxy =
  !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
  !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

if (!useOwnKey && !useProxy) {
  throw new Error(
    "No Anthropic credentials found. Set ANTHROPIC_API_KEY, or provision the Replit AI integration (AI_INTEGRATIONS_ANTHROPIC_BASE_URL + AI_INTEGRATIONS_ANTHROPIC_API_KEY).",
  );
}

export const anthropic = useOwnKey
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });
