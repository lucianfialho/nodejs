import puppeteer from "puppeteer-extra";
import UserAgent from "user-agents";
import redis from "redis";

import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { sleep } from "./lib/utils.mjs";
import { NikeCrawler } from "./lib/nike.mjs";

import {
  REDIS_URL,
  BROWSER_HEADLESS,
  BROWSER_VIEWPORT_WIDTH,
  BROWSER_VIEWPORT_HEIGHT,
  RETRY_MULTIPLIER,
  RETRY_BASE,
  RETRY_ATTEMPTS,
} from "./lib/environment.mjs";
import { sendWhatsappMessage } from "./lib/notifications/whatsapp.mjs";

puppeteer.use(StealthPlugin());

const redisClient = redis.createClient({ url: REDIS_URL });

let browser = null;
let page = null;

const catalogURLs = ["https://www.nike.com.br/nav/tipodeproduto/calcados"];

async function launchBrowser() {
  if (browser !== null) {
    await browser.close();
  }

  const userAgent = new UserAgent({
    deviceCategory: "desktop",
    platform: "Win32",
  });

  browser = await puppeteer.launch({
    headless: BROWSER_HEADLESS,
    defaultViewport: {
      width: BROWSER_VIEWPORT_WIDTH,
      height: BROWSER_VIEWPORT_HEIGHT,
    },
    args: ["--no-sandbox", `--user-agent=${userAgent.toString()}`],
  });
  page = await browser.newPage();
}

async function searchSneakerCatalogs() {
  const sneakers = {};
  const crawler = new NikeCrawler();

  for (const url of catalogURLs) {
    console.info(`[INFO] Discovering sneakers at: ${url}`);

    const catalog = await crawler.discoverPaginations(page, url);

    for (const sneaker of catalog) {
      sneakers[sneaker.productURL] = sneaker;
    }
  }

  return Object.values(sneakers);
}

async function scrapeSneakerDetails(sneakers) {
  let dailyPriceChanges = [];
  let todayReleases = [];
  const today = new Date().toISOString().split("T")[0]; // Data atual no formato YYYY-MM-DD

  for (const [i, sneaker] of sneakers.entries()) {
    let attempt = 0;
    let details = null;

    while (attempt <= RETRY_ATTEMPTS) {
      attempt++;

      try {
        console.info(
          `[INFO] Scraping sneaker ${i + 1}/${
            sneakers.length
          } (attempt: ${attempt}/${RETRY_ATTEMPTS}): ${sneaker.productURL}`
        );

        const [response] = await Promise.all([
          page.waitForNavigation(),
          page.goto(sneaker.refererURL, { timeout: 60000 }),
        ]);

        console.log("Carreguei a página da referencia");

        if (!response || response.status() !== 200) {
          throw new Error(
            `Failed to load page, status code: ${
              response ? response.status() : "unknown"
            }`
          );
        }

        await page.waitForSelector('[data-testid="products-search-3"]', {
          timeout: 60000,
        });

        console.log("Carreguei a página da referencia");
        details = await sneaker.scrape(page);

        page.removeAllListeners("request");
      } catch (error) {
        console.info(
          `[INFO] An error occurred while trying to scrape sneaker ${i + 1}/${
            sneakers.length
          }: ${error.message}`
        );
      }

      if (details !== null) {
        const existingData = await redisClient.get(
          `${details.source}:${details.code}`
        );

        // Verificar se o lançamento é hoje e ocorre até as 10h
        if (details.releaseDate) {
          const releaseDate = details.releaseDate.split("T")[0];
          const releaseTime = new Date(details.releaseDate);

          if (releaseDate === today && releaseTime.getHours() <= 10) {
            todayReleases.push({
              silhoutte: details.silhoutte,
              url: details.url,
            });
          }
        }

        if (existingData) {
          let changeType = "";
          let priceChange = "";
          const existingDataParsed = JSON.parse(existingData);

          // Verificar mudanças no preço promocional ou no preço normal
          const previousPrice =
            existingDataParsed.promotionalPrice ||
            existingDataParsed.originalPrice;
          const currentPrice =
            details.promotionalPrice || details.originalPrice;

          if (previousPrice > currentPrice) {
            const priceDifference = currentPrice - previousPrice;
            const pricePercentage = (
              (priceDifference / previousPrice) *
              100
            ).toFixed(2);

            // Verificar se a diferença de preço é maior que 20%
            if (Math.abs(pricePercentage) > 30) {
              priceChange = `O preço mudou de R$${previousPrice.toFixed(
                2
              )} para R$${currentPrice.toFixed(2)} (${
                priceDifference > 0 ? "↑" : "↓"
              } ${Math.abs(pricePercentage)}%)\n`;

              dailyPriceChanges.push({
                silhoutte: details.silhoutte,
                priceChange: priceChange,
                url: details.url,
              });

              changeType = "⚡ Mudança de Preço";
              const priceChangeMessage =
                `${changeType} no tênis ${details.silhoutte}!\n` +
                `${priceChange}` +
                `Tamanhos disponíveis: ${details.availableSizes.join(", ")}\n` +
                `🛒 Confira aqui: ${details.url}`;

              // Enviar mensagem somente se a diferença de preço for maior que 10%
              await sendWhatsappMessage(
                priceChangeMessage,
                details.images[0].url
              );
            } else {
              console.info(
                `[INFO] Mudança de preço inferior a 10%. Nenhuma mensagem enviada.`
              );
            }
          }

          if (!existingDataParsed.stocked && details.stocked) {
            changeType = "🚨 Reestoque";

            const restockMessage =
              `${changeType} para o tênis ${details.silhoutte}!\n` +
              `Agora disponível! ✅\n` +
              `Tamanhos disponíveis: ${details.availableSizes.join(", ")}\n` +
              `🛒 Confira aqui: ${details.url}`;

            await sendWhatsappMessage(restockMessage, details.images[0].url);
          }

          if (changeType) {
            console.info(
              `[INFO] ${changeType} detected for sneaker ${details.code}.`
            );
            await redisClient.set(
              `${details.source}:${details.code}`,
              JSON.stringify(details)
            );
          }
        } else {
          console.info(
            `[INFO] Sneaker ${details.code} não encontrado no Redis. Salvando novos dados.`
          );
          await redisClient.set(
            `${details.source}:${details.code}`,
            JSON.stringify(details)
          );
        }

        break;
      }

      if (attempt < RETRY_ATTEMPTS) {
        const delay = RETRY_MULTIPLIER * Math.pow(RETRY_BASE, attempt - 1);
        console.info(
          `[INFO] Retentando o tênis ${i + 1}/${sneakers.length} em ${delay}ms.`
        );
        console.log(delay, RETRY_MULTIPLIER);
        await sleep(delay);

        console.info(`[INFO] Reiniciando o navegador...`);
        await launchBrowser();

        console.info(
          `[INFO] Navegando para a URL de referência: ${sneaker.refererURL}`
        );
      }
    }
  }

  // Chamar a função de resumo diário no final da execução do scraping
  await sendDailyPriceSummary(dailyPriceChanges, todayReleases);
}

async function sendDailyPriceSummary(dailyPriceChanges, todayReleases) {
  let summaryMessage = "";

  if (dailyPriceChanges.length > 0) {
    summaryMessage += "📊 Resumo Diário de Preços 📊\n\n";

    dailyPriceChanges.forEach((change) => {
      summaryMessage += `👟 ${change.silhoutte}\n${change.priceChange}🛒 Link: ${change.url}\n\n`;
    });

    summaryMessage += "Não perca essas oportunidades! ⚡\n\n";
  }

  if (todayReleases.length > 0) {
    summaryMessage += "🎉 Lançamentos de Hoje (Até 10h) 🎉\n\n";

    todayReleases.forEach((release) => {
      summaryMessage += `👟 ${release.silhoutte}\n🛒 Link: ${release.url}\n\n`;
    });

    summaryMessage += "Fique de olho e garanta o seu! 🚀";
  }

  if (summaryMessage) {
    await sendWhatsappMessage(summaryMessage);
  } else {
    console.info(
      "[INFO] Nenhuma variação de preço ou lançamento significativo para o resumo diário."
    );
  }
}

redisClient.on("error", (error) =>
  console.error("[ERROR] Redis Client: ", error)
);

redisClient.on("connect", () => console.info("[INFO] Connected to Redis."));
redisClient.on("end", () => console.info("[INFO] Disconnected from Redis."));

console.info("[INFO] Connecting to Redis...");
await redisClient.connect();

console.info("[INFO] Launching browser...");
await launchBrowser();

const sneakers = await searchSneakerCatalogs();
await scrapeSneakerDetails(sneakers);

console.info("[INFO] Closing browser...");
await browser.close();

console.info("[INFO] Disconnecting from Redis...");
await redisClient.disconnect();
