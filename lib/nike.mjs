async function scrollnfiniteContainer(page, selector) {
  await page.evaluate((selector) => {
    const step = 200;
    const interval = 100;

    const e = document.querySelector(selector);

    const doStep = () => {
      const rect = e.getBoundingClientRect();

      window.scrolling = rect.y + rect.height > window.innerHeight;

      if (window.scrolling) {
        window.scrollBy(0, step);
      }

      setTimeout(doStep, interval);
    };

    doStep();
  }, selector);

  while (await page.evaluate(() => window.scrolling)) {
    await page.waitForNetworkIdle();
  }
}

async function preventPageModals(page) {
  await page.evaluate(() => {
    setInterval(() => {
      const acceptCookiesButton = document.querySelector(
        "button#adopt-accept-all-button"
      );
      const closeInsPreviewButton = document.querySelector(
        '.ins-preview-wrapper div[id^="close-button"]'
      );

      acceptCookiesButton?.click();
      closeInsPreviewButton?.click();
    }, 100);
  });
}

export class NikeHttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class NikeSneaker {
  constructor(refererURL, productURL) {
    this.refererURL = refererURL;
    this.productURL = productURL;
  }

  async scrape(page) {
    const promise = new Promise(async (resolve) => {
      page.once("domcontentloaded", async () => {
        const sneaker = await page.evaluate(async () => {
          const productData = window?.__NEXT_DATA__?.props?.pageProps?.product;

          if (!productData) {
            return null;
          }

          return {
            url: window.location.href,
            source: "nike",
            code: productData.code,
            brand: productData.brand,
            collection: productData.collection,
            silhoutte: productData.name,
            colorway: productData.nickname,
            description: productData.description,
            gender: productData.gender,
            stocked: productData.sizes.every((s) => s.hasStock),
            released: productData.isReleased,
            releaseDate: productData.releaseDate,
            price: productData.priceInfos.price,
            images: productData.images
              .sort((i) => i.order)
              .map((i) => ({
                url: i.url,
                description: i.description,
              })),
          };
        });

        resolve(sneaker);
      });
    });

    const [response] = await Promise.all([
      page.waitForNavigation(),
      page.goto(this.productURL, { referer: this.refererURL }),
    ]);

    await preventPageModals(page);

    if (response.status() === 403) {
      throw new NikeHttpError(
        "Fetching product page failed.",
        response.status()
      );
    }

    return promise;
  }
}

export class NikeCrawler {
  constructor(userAgent) {
    this.userAgent = userAgent;
  }

  async discover(page, catalogURL) {
    await page.goto(catalogURL);

    await preventPageModals(page);
    await page.waitForNetworkIdle();

    await scrollnfiniteContainer(page, '[data-testid="products-search"]');

    const productURLs = await page.$$eval(
      '[data-testid="products-search"] a',
      (elements) => elements.map((e) => e.href)
    );

    return productURLs.map((url) => new NikeSneaker(catalogURL, url));
  }

  async discoverPaginations(page, catalogURL) {
    let allProductURLs = [];

    await page.goto(catalogURL);

    // Prevenir modais indesejados
    await preventPageModals(page);
    await page.waitForNetworkIdle();

    // Extrair o número total de páginas a partir do último elemento de paginação
    const totalPages = await page.$eval(
      "#section-pagination ol a:last-child",
      (el) => parseInt(el.textContent.trim())
    );

    console.info(`[INFO] Número total de páginas: ${totalPages}`);

    // Iterar sobre cada página de 1 até o total de páginas
    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.info(
        `[INFO] Scraping page ${currentPage} of ${totalPages} for product URLs...`
      );

      // Navegar para a URL da página específica
      const pageURL = `${catalogURL}?page=${currentPage}&sorting=DescReleaseDate`;
      await page.goto(pageURL, {
        timeout: 60000,
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector('[data-testid="products-search-3"]');

      // Extrair os URLs dos produtos na página atual
      const productURLs = await page.$$eval(
        '[data-testid="products-search-3"] a',
        (elements) => elements.map((e) => e.href)
      );

      allProductURLs.push(
        ...productURLs.map((url) => new NikeSneaker(catalogURL, url))
      );
    }

    return allProductURLs;
  }
}
