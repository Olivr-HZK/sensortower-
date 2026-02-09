#!/usr/bin/env node
/**
 * 通过 Google Play 商店链接爬取应用/游戏详情，使用 Playwright 获取页面，
 * 从 AF_initDataCallback(ds:4) 中解析所需字段，写入 JSON 文件。
 *
 * 用法：
 *   node crawl_google_play.js <store_url> [output.json]
 * 示例：
 *   node crawl_google_play.js "https://play.google.com/store/apps/details?id=com.wb.goog.mkx"
 *   node crawl_google_play.js "https://play.google.com/store/apps/details?id=com.wb.goog.mkx" out.json
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT = 'google_play_app.json';

function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function stripTags(text) {
  if (!text || typeof text !== 'string') return text;
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, '')).trim();
}

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch (e) {
      // 有些页面可能包含多个 JSON 对象，忽略解析失败的块
    }
  }
  return blocks;
}

function parseJsonLd(blocks) {
  if (!blocks || !blocks.length) return null;
  const list = [];
  for (const b of blocks) {
    if (Array.isArray(b)) list.push(...b);
    else list.push(b);
  }
  const app = list.find((item) => item && item['@type'] === 'SoftwareApplication') || list[0];
  if (!app || typeof app !== 'object') return null;
  const ratingValue = app.aggregateRating && app.aggregateRating.ratingValue ? parseFloat(app.aggregateRating.ratingValue) : null;
  const price = Array.isArray(app.offers) && app.offers[0] ? app.offers[0].price : app.offers && app.offers.price;
  const priceValue = price !== undefined && price !== null ? parseFloat(price) : null;
  return {
    title: app.name || null,
    shortDescription: app.description || null,
    storeUrl: app.url || null,
    iconUrl: app.image || null,
    contentRating: app.contentRating || null,
    developer: app.author && app.author.name ? app.author.name : null,
    rating: Number.isFinite(ratingValue) ? ratingValue : null,
    category: app.applicationCategory || null,
    priceValue,
  };
}

function extractInstallsFromHtml(html) {
  const re = /<div[^>]*class="ClM7O"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="g1rdde"[^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = re.exec(html))) {
    const value = stripTags(match[1]);
    const label = stripTags(match[2]).toLowerCase();
    if (!value || !label) continue;
    if (
      label.includes('download') ||
      label.includes('instal') ||
      label.includes('install') ||
      label.includes('descarga') ||
      label.includes('下载') ||
      label.includes('下载量')
    ) {
      return value;
    }
  }
  return null;
}

function extractVideoFromHtml(html) {
  const match = html.match(/https:\/\/i\.ytimg\.com\/vi\/([^/]+)\/hqdefault\.jpg/);
  if (!match) return { videoThumbnailUrl: null, videoId: null };
  return { videoThumbnailUrl: match[0], videoId: match[1] };
}

function extractSimilarAppIdsFromHtml(html, packageId) {
  const ids = new Set();
  const re = /\/store\/apps\/details\?id=([A-Za-z0-9._-]+)/g;
  let match;
  while ((match = re.exec(html))) {
    const id = match[1];
    if (!id || id === packageId) continue;
    if (id.startsWith('com.')) ids.add(id);
  }
  return [...ids].slice(0, 20);
}

function extractPlayImagesFromHtml(html) {
  const urls = html.match(/https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9_=-]+/g);
  return urls ? [...new Set(urls)] : [];
}

/**
 * 从 HTML 中提取 AF_initDataCallback 里 key 为 ds:4 的 data 数组（字符串），再 JSON 解析。
 */
function extractDs4Data(html) {
  const key = "key: 'ds:4'";
  const idx = html.indexOf(key);
  if (idx === -1) return null;
  const dataPrefix = 'data:';
  const dataStart = html.indexOf(dataPrefix, idx);
  if (dataStart === -1) return null;
  const arrayStart = dataStart + dataPrefix.length;
  let i = arrayStart;
  let depth = 0;
  let inDouble = false;
  let inSingle = false;
  let escape = false;
  let stringChar = null;
  const len = html.length;
  while (i < len) {
    const c = html[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (inDouble || inSingle) {
      if (c === '\\') escape = true;
      else if (c === stringChar) inDouble = inSingle = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      stringChar = c;
      if (c === '"') inDouble = true;
      else inSingle = true;
      i++;
      continue;
    }
    if (c === '[') {
      depth++;
      i++;
      continue;
    }
    if (c === ']') {
      depth--;
      if (depth === 0) {
        const raw = html.substring(arrayStart, i + 1);
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      }
      i++;
      continue;
    }
    i++;
  }
  return null;
}

/**
 * 提取页面中所有 AF_initDataCallback 的 data 数组
 */
function extractAllCallbackData(html) {
  const results = [];
  let pos = 0;
  while (pos < html.length) {
    const idx = html.indexOf('AF_initDataCallback({key:', pos);
    if (idx === -1) break;
    const keyMatch = html.substring(idx, idx + 80).match(/key:\s*'([^']+)'/);
    const key = keyMatch ? keyMatch[1] : null;
    const dataStart = html.indexOf('data:', idx);
    if (dataStart === -1) {
      pos = idx + 1;
      continue;
    }
    const arrayStart = dataStart + 'data:'.length;
    let i = arrayStart;
    let depth = 0;
    let inDouble = false;
    let inSingle = false;
    let escape = false;
    let stringChar = null;
    const len = html.length;
    while (i < len) {
      const c = html[i];
      if (escape) {
        escape = false;
        i++;
        continue;
      }
      if (inDouble || inSingle) {
        if (c === '\\') escape = true;
        else if (c === stringChar) inDouble = inSingle = false;
        i++;
        continue;
      }
      if (c === '"' || c === "'") {
        stringChar = c;
        if (c === '"') inDouble = true;
        else inSingle = true;
        i++;
        continue;
      }
      if (c === '[') {
        depth++;
        i++;
        continue;
      }
      if (c === ']') {
        depth--;
        if (depth === 0) {
          const raw = html.substring(arrayStart, i + 1);
          try {
            const data = JSON.parse(raw);
            results.push({ key, data });
          } catch (e) {
            // 忽略解析失败的块
          }
          pos = i + 1;
          break;
        }
        i++;
        continue;
      }
      i++;
    }
    pos = i + 1;
  }
  return results;
}

/**
 * 递归扁平化数组/对象，收集所有字符串与数字，保持顺序。
 */
function flattenValues(arr, out = []) {
  if (arr === null || arr === undefined) return out;
  if (Array.isArray(arr)) {
    for (const item of arr) flattenValues(item, out);
    return out;
  }
  if (typeof arr === 'object') {
    for (const v of Object.values(arr)) flattenValues(v, out);
    return out;
  }
  if (typeof arr === 'string' || typeof arr === 'number') out.push(arr);
  return out;
}

function chooseBestData(candidates, appId) {
  let best = null;
  let bestScore = -1;
  for (const item of candidates) {
    const data = item.data;
    if (!data) continue;
    const flat = flattenValues(data, []);
    const strings = flat.filter((v) => typeof v === 'string');
    let score = 0;
    if (appId && strings.includes(appId)) score += 5;
    if (strings.some((s) => s.includes('play-lh.googleusercontent.com'))) score += 2;
    if (strings.some((s) => s.includes('/store/apps/details?id='))) score += 2;
    if (strings.some((s) => /^\d\.\d$/.test(s))) score += 1;
    if (strings.some((s) => /^[\d,]+\+?$/.test(s))) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = data;
    }
  }
  return best;
}

/**
 * 从 ds:4 的 data 根结构中收集所有 play-lh 图片 URL，并区分图标(小图)与截图(大图)。
 * 结构示例: [null, 2, [512,512], [null, null, "https://play-lh..."]]
 */
function collectImageUrls(arr, out = { icon: null, screenshots: [] }) {
  if (!arr || typeof arr !== 'object') return out;
  if (Array.isArray(arr)) {
    const hasDims = arr.length >= 3 && Array.isArray(arr[2]) && arr[2].length >= 2 && typeof arr[2][0] === 'number' && typeof arr[2][1] === 'number';
    const dims = hasDims ? [arr[2][0], arr[2][1]] : null;
    const urlBlock = arr.length >= 4 && Array.isArray(arr[3]) ? arr[3] : (arr[2] && Array.isArray(arr[2]) && arr[2][2] ? arr[2] : null);
    const url = urlBlock && Array.isArray(urlBlock) ? (urlBlock[2] || urlBlock[1]) : null;
    if (url && typeof url === 'string' && url.includes('play-lh.googleusercontent.com')) {
      if (dims && dims[0] <= 512 && dims[1] <= 512 && !out.icon) out.icon = url;
      else if (dims && (dims[0] >= 720 || dims[1] >= 720)) out.screenshots.push(url);
      else if (!out.icon && !dims) out.icon = url;
    }
    for (const item of arr) collectImageUrls(item, out);
    return out;
  }
  for (const v of Object.values(arr)) collectImageUrls(v, out);
  return out;
}

/**
 * 从扁平化后的字符串列表中按规则识别各字段。
 */
function parseFieldsFromFlat(values, appId) {
  const strings = values.filter((v) => typeof v === 'string');
  const result = {
    packageId: null,
    title: null,
    rating: null,
    installs: null,
    developer: null,
    category: null,
    categoryId: null,
    shortDescription: null,
    fullDescription: null,
    contentRating: null,
    contentRatingLabels: [],
    priceType: null,
    storeUrl: null,
    iconUrl: null,
    screenshotUrls: [],
    videoThumbnailUrl: null,
    videoId: null,
    similarAppIds: [],
    eventEndTime: null,
  };
  let seenPackage = false;
  let seenRating = false;
  let seenInstalls = false;
  let seenDeveloper = false;
  let seenContentRating = false;
  const detailsBase = '/store/apps/details?id=';
  const packageRegex = /^com\.[a-zA-Z0-9_.]+$/;
  const ratingRegex = /^\d\.\d$/;
  const installsRegex = /^[\d,]+\+?$|^[\d,]+[\s–-][\d,]+$/;
  const titleBlacklist = /in-?game purchases|in-?app purchases|top free|top grossing|free|install|puzzle|action|arcade|casual|strategy|simulation|racing|sports|role playing|card|music|adventure/i;
  const priceLike = /^[₹$€¥£]|per item|items?$/i;
  const similarPackages = new Set();
  const appIdIndex = appId ? strings.indexOf(appId) : -1;

  const isPriceLike = (t) => priceLike.test(t) || t.includes('per item') || t.includes('per month');
  const isBadTitle = (t) => titleBlacklist.test(t) || isPriceLike(t);
  const isCategory = (t) =>
    /^(动作|冒险|休闲|卡牌|体育|策略|模拟|角色扮演|解谜|竞速|音乐|其他|Action|Arcade|Casual|Strategy|Simulation|Racing|Puzzle|Sports|Role Playing|Card|Music|Adventure|GAME_ACTION)$/i.test(
      t
    );

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    const trimmed = s.trim();
    if (!trimmed) continue;

    if (packageRegex.test(trimmed)) {
      if (!seenPackage && trimmed.length > 10) {
        result.packageId = trimmed;
        seenPackage = true;
      } else if (seenPackage && result.packageId !== trimmed) {
        similarPackages.add(trimmed);
      }
    }
    if (ratingRegex.test(trimmed)) {
      const n = parseFloat(trimmed);
      if (n >= 0 && n <= 5 && !seenRating) {
        result.rating = n;
        seenRating = true;
      }
    }
    if (installsRegex.test(trimmed.replace(/\s/g, ''))) {
      if (!seenInstalls) {
        result.installs = trimmed;
        seenInstalls = true;
      }
    }
    if (trimmed.startsWith(detailsBase)) {
      const id = trimmed.replace(detailsBase, '').split('&')[0];
      const fullUrl = 'https://play.google.com' + trimmed.split('&')[0];
      if (id === result.packageId) result.storeUrl = fullUrl;
      else if (!result.storeUrl) result.storeUrl = fullUrl;
    }
    if (trimmed.includes('ytimg.com/vi/') && trimmed.includes('/hqdefault.jpg')) {
      result.videoThumbnailUrl = trimmed;
    }
    if (trimmed.startsWith('yt:movie:') || trimmed.startsWith('yt:video:')) {
      result.videoId = trimmed.replace(/^yt:(movie|video):/, '');
    }
    if (trimmed.includes('结束时间：') || trimmed.includes('Ends ')) {
      result.eventEndTime = trimmed;
    }
  }

  const longTexts = strings.filter((s) => typeof s === 'string' && s.length > 100 && !s.startsWith('http'));
  const shortTexts = strings.filter(
    (s) =>
      typeof s === 'string' &&
      s.length > 10 &&
      s.length <= 100 &&
      !s.startsWith('http') &&
      !packageRegex.test(s.trim())
  );

  if (!result.title && appIdIndex >= 0) {
    for (let i = appIdIndex + 1; i < strings.length && i < appIdIndex + 8; i++) {
      const t = strings[i];
      if (!t || typeof t !== 'string') continue;
      if (t.length < 3 || t.length > 80) continue;
      if (t.includes('/store/')) continue;
      if (isBadTitle(t)) continue;
      result.title = t;
      break;
    }
  }
  if (shortTexts.length) {
    const maybeTitle = shortTexts.find((t) => {
      if (titleBlacklist.test(t)) return false;
      if (priceLike.test(t)) return false;
      if (t.includes('per item') || t.includes('per month')) return false;
      return /^[A-Za-z0-9\s\-.:]+$/.test(t) && t.length <= 80;
    });
    if (maybeTitle) result.title = maybeTitle;
  }
  const categoryCandidates = strings.filter((s) => typeof s === 'string' && s.length >= 2 && s.length <= 30 && !s.startsWith('http') && !packageRegex.test(s.trim()));
  for (const t of categoryCandidates) {
    if (t === result.title) continue;
    if (isCategory(t)) {
      result.category = t;
      break;
    }
  }
  const ageRatingPattern = /岁|Year|岁以上|Years?\s*old/i;
  for (const t of strings) {
    if (typeof t !== 'string' || t.length > 50) continue;
    if (ageRatingPattern.test(t) && (t.includes('+') || t.includes('以上') || /\d+/.test(t))) {
      result.contentRating = t;
      seenContentRating = true;
      break;
    }
  }
  const seenLabels = new Set();
  for (const t of strings) {
    if (typeof t !== 'string' || t.length > 80) continue;
    if ((t.includes('暴力') || t.includes('Violence') || t.includes('游戏内购买') || t.includes('Purchase')) && !seenLabels.has(t)) {
      seenLabels.add(t);
      result.contentRatingLabels.push(t);
    }
  }
  result.contentRatingLabels = result.contentRatingLabels.slice(0, 10);
  const storeUrlCandidates = strings.filter(
    (s) => typeof s === 'string' && s.includes('/store/apps/details?id=')
  );
  if (!result.storeUrl && storeUrlCandidates.length) {
    const prefer = storeUrlCandidates.find((s) => appId && s.includes(`id=${appId}`));
    result.storeUrl = 'https://play.google.com' + (prefer || storeUrlCandidates[0]).split('&')[0];
  }

  if (!result.developer && appIdIndex >= 0) {
    const urlIdx = strings.findIndex(
      (s) => typeof s === 'string' && s.includes(`/store/apps/details?id=${appId}`)
    );
    if (urlIdx >= 0 && urlIdx + 1 < strings.length) {
      const t = strings[urlIdx + 1];
      if (t && typeof t === 'string' && !isPriceLike(t) && t.length >= 3 && t.length <= 80) {
        result.developer = t;
      }
    }
  }

  for (const t of strings) {
    if (typeof t !== 'string') continue;
    if (priceLike.test(t) || t.includes('per item')) continue;
    if (t.length >= 5 && t.length <= 120 && !t.startsWith('http') && !packageRegex.test(t.trim())) {
      if (t.includes('Enterprises') || t.includes('Inc') || t.includes('Ltd') || t.includes('LLC') || t.includes('Games') || t.includes('Studio') || t.includes('.') && !t.includes('/')) {
        if (!result.developer) result.developer = t;
      }
    }
  }
  const base64Like = /^[A-Za-z0-9+/=_-]{20,}$/;
  for (const t of strings) {
    if (typeof t !== 'string') continue;
    if (base64Like.test(t.trim())) continue;
    if (packageRegex.test(t.trim())) continue;
    if (t.startsWith('/store/') || t.includes('details?id=') || t.startsWith('yt:') || t.includes('<') || t.includes('>')) continue;
    if (titleBlacklist.test(t) || priceLike.test(t)) continue;
    if (t.includes('@')) continue;
    if (t.length >= 20 && t.length <= 160 && !t.startsWith('http') && !t.includes('\n') && t !== result.developer && t !== result.title && !t.includes('\\u003')) {
      if (!result.shortDescription) result.shortDescription = t;
    }
  }
  const base64LikeLong = /^[A-Za-z0-9+/=_-]{80,}$/;
  for (const t of longTexts) {
    if (base64LikeLong.test(t.trim())) continue;
    if (t.includes('\n') || t.length > 200) {
      const cleaned = t.replace(/\\n/g, '\n').replace(/<[^>]+>/g, '');
      if (cleaned.length > 100 && !base64LikeLong.test(cleaned)) {
        result.fullDescription = cleaned.substring(0, 3000);
        break;
      }
    }
  }
  const priceStrings = strings.filter((s) => typeof s === 'string' && /^(购买|安装|免费|Free|Install|Paid|付费)$/.test(s.trim()));
  if (priceStrings.length) result.priceType = priceStrings[0].trim();
  if (!result.priceType) {
    for (const t of shortTexts) {
      if (t === '购买' || t === 'Install' || t === '安装' || t === 'Free' || t === '免费') {
        result.priceType = t;
        break;
      }
    }
  }
  result.similarAppIds = [...similarPackages].filter((id) => id !== result.packageId).slice(0, 20);
  return result;
}

/**
 * 从完整 HTML 解析出应用信息（含 ds:4 图片 URL）。
 */
function parseGooglePlayPage(html, appId) {
  const jsonLdBlocks = extractJsonLd(html);
  const jsonLd = parseJsonLd(jsonLdBlocks);
  let data = extractDs4Data(html);
  if (!data || (Array.isArray(data) && data.length === 0)) {
    const all = extractAllCallbackData(html);
    data = chooseBestData(all, appId);
  }
  if (!data && !jsonLd) return { ok: false, error: '未找到可解析的数据块', data: null };
  const flat = data ? flattenValues(data) : [];
  const fields = parseFieldsFromFlat(flat, appId);
  const images = data ? collectImageUrls(data) : { icon: null, screenshots: [] };
  if (images.icon) fields.iconUrl = images.icon;
  if (images.screenshots.length) fields.screenshotUrls = [...new Set(images.screenshots)].slice(0, 30);

  if (jsonLd) {
    if (jsonLd.title) fields.title = jsonLd.title;
    if (jsonLd.shortDescription) fields.shortDescription = jsonLd.shortDescription;
    if (jsonLd.storeUrl) fields.storeUrl = jsonLd.storeUrl;
    if (jsonLd.iconUrl) fields.iconUrl = jsonLd.iconUrl;
    if (jsonLd.contentRating) fields.contentRating = jsonLd.contentRating;
    if (jsonLd.developer) fields.developer = jsonLd.developer;
    if (jsonLd.category) fields.category = jsonLd.category;
    if (jsonLd.rating !== null) fields.rating = jsonLd.rating;
    if (jsonLd.priceValue !== null && fields.priceType === null) {
      fields.priceType = jsonLd.priceValue > 0 ? '购买' : '免费';
    }
    if (!fields.packageId && jsonLd.storeUrl) {
      const match = jsonLd.storeUrl.match(/[?&]id=([A-Za-z0-9._-]+)/);
      if (match) fields.packageId = match[1];
    }
  }

  const installs = extractInstallsFromHtml(html);
  if (installs) {
    const preferInstalls =
      !fields.installs ||
      installs.length >= String(fields.installs).length ||
      /[a-zA-Z+]|万|亿|mi|m|k/i.test(installs);
    if (preferInstalls) fields.installs = installs;
  }

  if (!fields.videoThumbnailUrl || !fields.videoId) {
    const video = extractVideoFromHtml(html);
    if (!fields.videoThumbnailUrl && video.videoThumbnailUrl) fields.videoThumbnailUrl = video.videoThumbnailUrl;
    if (!fields.videoId && video.videoId) fields.videoId = video.videoId;
  }

  if (!fields.similarAppIds || fields.similarAppIds.length === 0) {
    fields.similarAppIds = extractSimilarAppIdsFromHtml(html, fields.packageId || appId);
  }

  if (!fields.screenshotUrls || fields.screenshotUrls.length === 0) {
    const allImages = extractPlayImagesFromHtml(html);
    const screenshots = allImages.filter((u) => u !== fields.iconUrl).slice(0, 30);
    if (screenshots.length) fields.screenshotUrls = screenshots;
  }

  return { ok: true, data: fields, rawFlatLength: flat.length };
}

async function main() {
  const args = process.argv.slice(2);
  const url = args[0];
  const outputPath = args[1] || path.join(__dirname, DEFAULT_OUTPUT);
  if (!url) {
    console.error('用法: node crawl_google_play.js <store_url|本地.html> [output.json]');
    process.exit(1);
  }
  const input = url.trim();
  let html;
  let normalizedUrl;
  let appIdFromUrl = null;
  if (input.endsWith('.html') && fs.existsSync(path.resolve(input))) {
    normalizedUrl = 'file://' + path.resolve(input);
    console.log('从本地文件读取:', input);
    html = fs.readFileSync(path.resolve(input), 'utf8');
  } else {
    normalizedUrl = input.startsWith('http') ? input : 'https://play.google.com/store/apps/details?id=' + input;
    if (!normalizedUrl.includes('play.google.com')) {
      console.error('请提供 Google Play 应用详情链接、应用包名（如 com.wb.goog.mkx）或本地 .html 文件路径');
      process.exit(1);
    }
    const idMatch = normalizedUrl.match(/[?&]id=([A-Za-z0-9._-]+)/);
    if (idMatch) appIdFromUrl = idMatch[1];
    console.log('正在使用 Playwright 打开:', normalizedUrl);
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });
    await page.goto(normalizedUrl, { waitUntil: 'networkidle', timeout: 30000 });
    html = await page.content();
    await browser.close();
  }
  try {
    if (!appIdFromUrl) {
      const htmlIdMatch = html.match(/details\?id=([A-Za-z0-9._-]+)/);
      if (htmlIdMatch) appIdFromUrl = htmlIdMatch[1];
    }
    const parsed = parseGooglePlayPage(html, appIdFromUrl);
    if (!parsed.ok) {
      console.error(parsed.error);
      process.exit(1);
    }
    const output = {
      url: normalizedUrl,
      crawledAt: new Date().toISOString(),
      app: parsed.data,
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log('已写入:', outputPath);
    console.log('包名:', parsed.data.packageId);
    console.log('名称:', parsed.data.title);
    console.log('评分:', parsed.data.rating);
    console.log('下载量:', parsed.data.installs);
    console.log('开发者:', parsed.data.developer);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseGooglePlayPage, extractDs4Data };
