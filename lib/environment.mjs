import "dotenv/config";

export const REDIS_URL = process.env.REDIS_URL;
export const BROWSER_HEADLESS =
  (process.env.BROWSER_HEADLESS ?? "true").toLowerCase() === "true";
export const BROWSER_VIEWPORT_WIDTH = parseInt(
  process.env.BROWSER_VIEWPORT_WIDTH ?? "1920"
);
export const BROWSER_VIEWPORT_HEIGHT = parseInt(
  process.env.BROWSER_VIEWPORT_HEIGHT ?? "1080"
);
export const RETRY_MULTIPLIER = parseInt(
  process.env.RETRY_MULTIPLIER ?? "3000"
);
export const RETRY_BASE = parseFloat(process.env.RETRY_BASE ?? "5");
export const RETRY_ATTEMPTS = parseInt(process.env.RETRY_ATTEMPTS ?? "5");

export const KV_URL = parseInt(process.env.KV_URL);

export const TELEGRAM_BOT_TOKEN = parseInt(process.env.TELEGRAM_BOT_TOKEN);
export const TELEGRAM_CHAT_ID = parseInt(process.env.TELEGRAM_CHAT_ID);
