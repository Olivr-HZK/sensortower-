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
function parseFieldsFromFlat(values) {
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
  const similarPackages = new Set();

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
  const shortTexts = strings.filter((s) => typeof s === 'string' && s.length > 10 && s.length <= 100 && !s.startsWith('http') && !packageRegex.test(s.trim()));
  if (shortTexts.length) {
    const maybeTitle = shortTexts.find((t) => /^[A-Za-z0-9\s\-.:]+$/.test(t) && t.length <= 80);
    if (maybeTitle) result.title = maybeTitle;
  }
  const categoryCandidates = strings.filter((s) => typeof s === 'string' && s.length >= 2 && s.length <= 30 && !s.startsWith('http') && !packageRegex.test(s.trim()));
  for (const t of categoryCandidates) {
    if (t === result.title) continue;
    if (t.match(/^(动作|冒险|休闲|卡牌|体育|策略|模拟|角色扮演|解谜|竞速|音乐|其他|Action|Arcade|Casual|Strategy|Simulation|Racing|Puzzle|Sports|Role Playing|Card|Music|Adventure|GAME_ACTION)$/i)) {
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
  for (const t of strings) {
    if (typeof t !== 'string') continue;
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
    if (t.length >= 15 && t.length <= 120 && !t.startsWith('http') && !t.includes('\n') && t !== result.developer && t !== result.title && !t.includes('\\u003')) {
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
function parseGooglePlayPage(html) {
  const data = extractDs4Data(html);
  if (!data) return { ok: false, error: '未找到 ds:4 数据', data: null };
  const flat = flattenValues(data);
  const fields = parseFieldsFromFlat(flat);
  const images = collectImageUrls(data);
  if (images.icon) fields.iconUrl = images.icon;
  if (images.screenshots.length) fields.screenshotUrls = [...new Set(images.screenshots)].slice(0, 30);
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
    const parsed = parseGooglePlayPage(html);
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
