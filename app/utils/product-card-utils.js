const PRODUCT_LINK_TITLE_BLACKLIST = new Set([
  "here",
  "this product",
  "product",
  "products",
  "link",
  "shop now",
  "view product",
  "learn more",
  "click here",
  "buy now",
  "see product",
  "details",
]);

const PRODUCT_URL_BLACKLIST = [/\/cart/i, /checkout/i, /authentication/i, /\/account/i];

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(url) {
  const cleaned = cleanString(url);
  if (!cleaned) return "";

  try {
    const parsed = new URL(cleaned, "https://example.com");
    if (cleaned.startsWith("/") && parsed.origin === "https://example.com") {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch (error) {
    return cleaned;
  }
}

function isProductUrl(url) {
  const normalized = normalizeUrl(url).toLowerCase();
  if (!normalized) return false;

  if (PRODUCT_URL_BLACKLIST.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  try {
    const parsed = new URL(normalized, "https://example.com");
    return parsed.pathname.toLowerCase().includes("/products/");
  } catch (error) {
    return normalized.includes("/products/");
  }
}

function isLikelyProductTitle(title) {
  const normalized = cleanString(title).toLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized.length < 2) return false;
  return !PRODUCT_LINK_TITLE_BLACKLIST.has(normalized);
}

function getFirstString(...values) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function isProductLikeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const title = getFirstString(
    value.title,
    value.name,
    value.product_title,
    value.label,
  );
  const url = getFirstString(
    value.url,
    value.link,
    value.href,
    value.product_url,
    value.permalink,
  );
  const handle = getFirstString(value.handle);
  const productId = getFirstString(value.product_id, value.productId, value.id);

  return Boolean(
    isLikelyProductTitle(title) &&
      (isProductUrl(url) || Boolean(handle) || Boolean(productId)),
  );
}

function normalizeProductData(product) {
  const title = getFirstString(
    product?.title,
    product?.name,
    product?.product_title,
    product?.label,
    "Product",
  );

  const handle = getFirstString(product?.handle);
  const url = normalizeUrl(
    getFirstString(
      product?.url,
      product?.link,
      product?.href,
      product?.product_url,
      product?.permalink,
      handle ? `/products/${handle}` : "",
    ),
  );

  const price = product?.price_range
    ? `${product.price_range.currency} ${product.price_range.min}`
    : product?.priceRange
      ? `${product.priceRange.currency} ${product.priceRange.min}`
      : product?.variants && product.variants.length > 0
        ? `${product.variants[0].currency || ""} ${product.variants[0].price || ""}`.trim()
        : product?.price
          ? String(product.price)
          : "Price not available";

  const imageUrl = normalizeUrl(
    getFirstString(
      product?.image_url,
      product?.imageUrl,
      product?.featured_image,
      product?.featuredImage?.url,
      product?.image?.src,
      product?.images?.[0]?.url,
    ),
  );

  const description = getFirstString(
    product?.description,
    product?.body,
    product?.summary,
    product?.excerpt,
  );

  const id =
    getFirstString(
      product?.id,
      product?.product_id,
      product?.productId,
      product?.handle,
    ) || `${title}-${url}`;

  return {
    id,
    title,
    price,
    image_url: imageUrl,
    description,
    url,
  };
}

function dedupeProducts(products) {
  const seen = new Set();

  return products.filter((product) => {
    if (!product) return false;

    const key =
      cleanString(product.url).toLowerCase() ||
      cleanString(product.id).toLowerCase() ||
      cleanString(product.title).toLowerCase();
    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function extractProductsFromText(text) {
  if (typeof text !== "string" || !text.trim()) return [];

  const products = [];
  const seen = new Set();
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const title = cleanString(match[1]);
    const url = cleanString(match[2]);

    if (!isLikelyProductTitle(title) || !isProductUrl(url)) {
      continue;
    }

    const product = normalizeProductData({ title, url });
    const key =
      cleanString(product.url).toLowerCase() ||
      cleanString(product.title).toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    products.push(product);
  }

  return dedupeProducts(products);
}

function collectRawProducts(value, seen = new Set()) {
  if (value == null) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      return collectRawProducts(JSON.parse(trimmed), seen);
    } catch (error) {
      return extractProductsFromText(trimmed);
    }
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isProductLikeObject)) {
      return value;
    }

    for (const item of value) {
      const found = collectRawProducts(item, seen);
      if (found.length > 0) return found;
    }

    return [];
  }

  if (typeof value === "object") {
    if (seen.has(value)) return [];
    seen.add(value);

    if (Array.isArray(value.products) && value.products.length > 0) {
      return value.products;
    }

    if (Array.isArray(value.items) && value.items.some(isProductLikeObject)) {
      return value.items;
    }

    for (const nestedValue of Object.values(value)) {
      const found = collectRawProducts(nestedValue, seen);
      if (found.length > 0) return found;
    }
  }

  return [];
}

function extractProductsFromAssistantContent(content) {
  const rawProducts = collectRawProducts(content);
  if (rawProducts.length > 0) {
    return dedupeProducts(rawProducts.map((product) => normalizeProductData(product)));
  }

  if (Array.isArray(content)) {
    const text = content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");

    return extractProductsFromText(text);
  }

  if (typeof content === "string") {
    return extractProductsFromText(content);
  }

  return [];
}

export {
  collectRawProducts,
  dedupeProducts,
  extractProductsFromAssistantContent,
  extractProductsFromText,
  isProductLikeObject,
  isProductUrl,
  isLikelyProductTitle,
  normalizeProductData,
};
