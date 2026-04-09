#!/usr/bin/env node
/**
 * 依据 data/appid_us.json 中 us_free_category_ranking_summary 的免费榜维度；
 * 可选 competitors：[{ name, apple_app_id?, google_app_id? }] 与本品共用同一套 summary 榜单维度，仅 app id 不同；飞书折叠内竞品默认只展开「游戏总榜」行，其余分榜在内层 collapsible_panel。
 * 可选字段 us_free_weekly_note（如「游戏总榜」）会写入本地简报「备注」行及飞书折叠块首行。
 * 用 category_history（与 Arrow Madness 相同）拉取「上上周日 vs 上周日」排名，写入独立 SQLite；
 * API 拉取按「同 os+device+category+chart_type」合并 app_ids，每批最多 30 个（见 scripts/test_category_history_batch_params.js）；
 * 若 summary 中没有任何维度，则对 game / casual / board / card / puzzle 五类各查一遍（iPhone+iPad+Android），
 * 并推送飞书（样式对齐 compare_and_summarize）。
 *
 * 用法：
 *   node scripts/us_free_appid_weekly_rank_changes.js [DATE_NEW] [DATE_OLD]
 *   node scripts/us_free_appid_weekly_rank_changes.js --no-feishu
 *   node scripts/us_free_appid_weekly_rank_changes.js --feishu-only [DATE_NEW] [DATE_OLD]
 *   node scripts/us_free_appid_weekly_rank_changes.js --verify-urls
 *
 * 环境：SENSORTOWER_API_TOKEN（全量拉数）、FEISHU_WEBHOOK_URL（推送时）；
 *       SENSORTOWER_OVERVIEW_BASE（默认 https://app.sensortower-china.com）、
 *       ST_CHINA_OVERVIEW_PARENT_ID（可选，overview 路径中的 project_id）
 *       FEISHU_RANK_DETAIL_EXPANDED=1（可选，排名明细折叠面板默认展开；默认折叠）
 * 飞书：顶部摘要与折叠标题在游戏名后接（ios/android 环比）；iPad 仅在正文明细；在榜指前500；分榜明细按首字母、collapsible_panel（需飞书 ≥7.9）。
 * 遇 11232 频率限制则退避重试。
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const initSqlJs = require("sql.js");
const { getRankFromData } = require("../arrow_madness_rank_parse.js");

const ROOT = path.join(__dirname, "..");
const APPID_US_JSON = path.join(ROOT, "data", "appid_us.json");
const DB_PATH = path.join(ROOT, "data", "us_free_appid_weekly.db");

const COUNTRY = "US";
const SENSORTOWER_API_HOST = "api.sensortower-china.com";

/** 与 Python SENSORTOWER_OVERVIEW_BASE 一致 */
const SENSORTOWER_OVERVIEW_BASE_DEFAULT = "https://app.sensortower-china.com";

const httpsAgent = new https.Agent({ keepAlive: false, maxSockets: 1 });
const REQUEST_TIMEOUT_MS = 90000;
const MAX_RETRIES = 6;
const BETWEEN_QUERIES_MS = 450;
/** 与 docs/API_DOCUMENTATION.md 一致：category_history 单请求最多约 30 个 app_id */
const CATEGORY_HISTORY_APP_IDS_BATCH = 30;

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getLastSunday(d = new Date()) {
  const day = d.getDay();
  const daysBack = day === 0 ? 7 : day;
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysBack);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dayNum = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayNum}`;
}

function addDays(ymd, delta) {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 与 Arrow Madness 一致：ios/ipad/android + 游戏 + 子类；Android category_id=all 为「平台-总榜」（无「游戏」段） */
function rankCompactLabel(q) {
  const plat = q.os === "ios" ? (q.device === "iphone" ? "ios" : "ipad") : "android";
  let c = String(q.category);
  const m = /^category_(\d+)$/.exec(c);
  if (m) c = m[1];
  const cn = (q.category_name || "").toLowerCase();
  if (c === "all") return `${plat}-总榜`;
  let sub = "总榜";
  if (c === "7003" || c === "game_casual") sub = "休闲";
  else if (c === "7012" || c === "game_puzzle") sub = "解谜";
  else if (c === "7004" || c === "game_board") sub = "棋盘游戏";
  else if (c === "7005" || c === "game_card") sub = "卡牌游戏";
  else if (c === "6014" || c === "game") sub = "总榜";
  else if (cn.includes("board") || cn.includes("games/board")) sub = "棋盘游戏";
  else if (cn.includes("games/card") || /\bcard\b/i.test(q.category_name || "")) sub = "卡牌游戏";
  return `${plat}-游戏-${sub}`;
}

/** 简报 / 纯文本：仅两周名次，不含名次差 */
function formatRankCompactLine(q, o, n) {
  const label = rankCompactLabel(q);
  if (o == null && n == null) return `${label}：未上榜-未上榜`;
  if (o == null && n != null) return `${label}：未上榜-${n}`;
  if (o != null && n == null) return `${label}：${o}-未上榜`;
  return `${label}：${o}-${n}`;
}

/**
 * 飞书折叠明细：两周名次 + 名次差；名次变小（变好）红，名次变大（变差）绿（diff = 旧 − 新）
 */
function formatRankCompactLineFeishu(q, o, n) {
  const label = rankCompactLabel(q);
  const L = `**${label}**`;
  if (o == null && n == null) return `${L}：未上榜-未上榜`;
  if (o == null && n != null) return `${L}：未上榜-${n}`;
  if (o != null && n == null) return `${L}：${o}-未上榜`;
  if (o === n) return `${L}：${o}-${n}`;
  const diff = o - n;
  const paren = diff > 0 ? `+${diff}` : `${diff}`;
  const bracket = `（${paren}）`;
  const colored =
    diff > 0 ? `<font color='red'>${bracket}</font>` : `<font color='green'>${bracket}</font>`;
  return `${L}：${o}-${n}${colored}`;
}

function dedupeCharts(charts) {
  if (!charts || !charts.length) return [];
  const seen = new Set();
  const out = [];
  for (const c of charts) {
    const k = `${c.chart_type_id}|${c.category_id}|${c.chart_device || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * summary 里没有任何免费榜维度时，用固定五类拉 category_history：
 * 游戏总榜 game、休闲 casual、棋盘 board、卡牌 card、解谜 puzzle（与仓库内其它脚本 category id 一致）
 */
const FALLBACK_IOS_CATEGORY_ROWS = [
  { category: "6014", category_name: "Games" },
  { category: "7003", category_name: "Games/Casual" },
  { category: "7004", category_name: "Games/Board" },
  { category: "7005", category_name: "Games/Card" },
  { category: "7012", category_name: "Games/Puzzle" },
];

const FALLBACK_ANDROID_CATEGORY_ROWS = [
  { category: "game", category_name: "Game" },
  { category: "game_casual", category_name: "Game/Casual" },
  { category: "game_board", category_name: "Game/Board" },
  { category: "game_card", category_name: "Game/Card" },
  { category: "game_puzzle", category_name: "Game/Puzzle" },
];

/**
 * subject：与 appid_us 一条产品或竞品行对应的展示字段；含 apple_app_id / google_app_id。
 */
function pushFallbackQueriesForSubject(subject, sum, out) {
  const base = {
    internal_name: subject.internal_name,
    product_code: subject.product_code,
    display_name: subject.display_name,
    apple_app_id: subject.apple_app_id || null,
    google_app_id: subject.google_app_id || null,
    country: (sum && sum.country) || COUNTRY,
    st_overview_parent_id: subject.st_overview_parent_id || null,
    us_free_weekly_note: subject.us_free_weekly_note || null,
    competitorParent: subject.competitorParent != null ? subject.competitorParent : null,
  };

  if (subject.apple_app_id) {
    const aid = String(subject.apple_app_id);
    for (const rowCat of FALLBACK_IOS_CATEGORY_ROWS) {
      out.push({
        ...base,
        q: {
          os: "ios",
          app_ids: [aid],
          category: rowCat.category,
          chart_type_ids: ["topfreeapplications"],
          device: "iphone",
          category_name: rowCat.category_name,
        },
      });
      out.push({
        ...base,
        q: {
          os: "ios",
          app_ids: [aid],
          category: rowCat.category,
          chart_type_ids: ["topfreeipadapplications"],
          device: "ipad",
          category_name: rowCat.category_name,
        },
      });
    }
  }

  if (subject.google_app_id) {
    const gid = String(subject.google_app_id);
    for (const rowCat of FALLBACK_ANDROID_CATEGORY_ROWS) {
      out.push({
        ...base,
        q: {
          os: "android",
          app_ids: [gid],
          category: rowCat.category,
          chart_type_ids: ["topselling_free"],
          device: "android",
          category_name: rowCat.category_name,
        },
      });
    }
  }
}

/** 按 summary 中已有维度展开（与产品、竞品共用同一套 chart 列表） */
function pushQueriesFromSummary(subject, sum, out) {
  const ios = sum.ios && sum.ios.charts && !sum.ios._error ? dedupeCharts(sum.ios.charts) : [];
  for (const ch of ios) {
    if (!subject.apple_app_id) continue;
    if (ch.chart_type_id !== "topfreeapplications" && ch.chart_type_id !== "topfreeipadapplications") continue;
    const device = ch.chart_device === "ipad" ? "ipad" : "iphone";
    out.push({
      internal_name: subject.internal_name,
      product_code: subject.product_code,
      display_name: subject.display_name,
      apple_app_id: subject.apple_app_id || null,
      google_app_id: subject.google_app_id || null,
      country: (sum && sum.country) || COUNTRY,
      st_overview_parent_id: subject.st_overview_parent_id || null,
      us_free_weekly_note: subject.us_free_weekly_note || null,
      competitorParent: subject.competitorParent != null ? subject.competitorParent : null,
      q: {
        os: "ios",
        app_ids: [String(subject.apple_app_id)],
        category: String(ch.category_id),
        chart_type_ids: [ch.chart_type_id],
        device,
        category_name: ch.category_name || "",
      },
    });
  }

  const android = sum.android && sum.android.charts && !sum.android._error ? dedupeCharts(sum.android.charts) : [];
  for (const ch of android) {
    if (!subject.google_app_id) continue;
    if (ch.chart_type_id !== "topselling_free") continue;
    out.push({
      internal_name: subject.internal_name,
      product_code: subject.product_code,
      display_name: subject.display_name,
      apple_app_id: subject.apple_app_id || null,
      google_app_id: subject.google_app_id || null,
      country: (sum && sum.country) || COUNTRY,
      st_overview_parent_id: subject.st_overview_parent_id || null,
      us_free_weekly_note: subject.us_free_weekly_note || null,
      competitorParent: subject.competitorParent != null ? subject.competitorParent : null,
      q: {
        os: "android",
        app_ids: [String(subject.google_app_id)],
        category: String(ch.category_id),
        chart_type_ids: [ch.chart_type_id],
        device: "android",
        category_name: ch.category_name || "",
      },
    });
  }
}

/**
 * 从 appid_us 一条记录展开为若干 q（优先 summary 中已有免费榜维度；若一条都没有则查 game/casual/board/card/puzzle 五类）。
 * 可选 competitors[]：与本品共用同一套 summary 维度，仅替换 apple_app_id / google_app_id；internal_name 为「本品名·竞品·竞品名」。
 */
function expandQueriesForApp(row) {
  const sum = row.us_free_category_ranking_summary;
  if (!sum || sum.country !== "US") return [];

  const out = [];

  const selfSubject = {
    internal_name: row.internal_name,
    product_code: row.product_code,
    display_name: row.display_name,
    apple_app_id: row.apple_app_id || null,
    google_app_id: row.google_app_id || null,
    st_overview_parent_id: row.st_overview_parent_id || null,
    us_free_weekly_note: row.us_free_weekly_note || null,
    competitorParent: null,
  };

  pushQueriesFromSummary(selfSubject, sum, out);
  if (out.length === 0) {
    pushFallbackQueriesForSubject(selfSubject, sum, out);
  }

  const comps = Array.isArray(row.competitors) ? row.competitors : [];
  for (const comp of comps) {
    const cname = String(comp.name || "").trim();
    if (!cname) continue;
    const apple = comp.apple_app_id != null && String(comp.apple_app_id).trim() !== "" ? String(comp.apple_app_id).trim() : null;
    const google = comp.google_app_id != null && String(comp.google_app_id).trim() !== "" ? String(comp.google_app_id).trim() : null;
    if (!apple && !google) continue;

    const compSubject = {
      internal_name: `${row.internal_name}·竞品·${cname}`,
      product_code: row.product_code,
      display_name: cname,
      apple_app_id: apple,
      google_app_id: google,
      st_overview_parent_id: row.st_overview_parent_id || null,
      us_free_weekly_note: row.us_free_weekly_note || null,
      competitorParent: row.internal_name,
    };

    const before = out.length;
    pushQueriesFromSummary(compSubject, sum, out);
    if (out.length === before) {
      pushFallbackQueriesForSubject(compSubject, sum, out);
    }
  }

  return out;
}

/** 必须含 app_id（同一 internal_name 可能对应多条 appid_us 行或不同包） */
function queryResultKey(internalName, q) {
  const aid = q.app_ids && q.app_ids[0] != null ? String(q.app_ids[0]) : "";
  return `${internalName}|${q.os}|${q.device}|${q.category}|${q.chart_type_ids[0]}|${aid}`;
}

/** 去掉完全相同的维度（常见于 appid_us 里重复 internal_name 且 summary 相同） */
function dedupeFlatQueries(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const k = queryResultKey(item.internal_name, item.q);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** 同一 internal_name 多行（不同包 / 不同 product_code）时分组，避免飞书里合并成一块导致重复行 */
function productGroupKey(item) {
  return `${item.internal_name}\t${item.product_code || ""}\t${item.apple_app_id || ""}\t${item.google_app_id || ""}`;
}

/**
 * 飞书/链接展示名：优先 internal_name；重复 internal_name 时 feishuLabel 为 name1、name2…
 * （由 assignInternalNameLabels 写入 block.feishuLabel）
 */
function linkTitleForProduct(block) {
  if (block.feishuLabel) return String(block.feishuLabel).trim();
  return String(block.internalName || "").trim() || String(block.displayName || "").trim();
}

/** 同一 internal_name 多条时标题为 name1、name2…；仅一条时不加后缀 */
function assignInternalNameLabels(productBlocks) {
  if (!productBlocks || !productBlocks.length) return productBlocks;
  const countBy = new Map();
  for (const b of productBlocks) {
    const key = String(b.internalName || "").trim() || "__empty__";
    countBy.set(key, (countBy.get(key) || 0) + 1);
  }
  const idxBy = new Map();
  for (const b of productBlocks) {
    const raw = String(b.internalName || "").trim() || "产品";
    const key = String(b.internalName || "").trim() || "__empty__";
    const total = countBy.get(key) || 1;
    if (total <= 1) {
      b.feishuLabel = raw;
    } else {
      const n = (idxBy.get(key) || 0) + 1;
      idxBy.set(key, n);
      b.feishuLabel = `${raw}${n}`;
    }
  }
  return productBlocks;
}

/** 各维度均为「未上榜-未上榜」时合并为一行展示 */
const RE_LINE_UNLISTED_FLAT = /：未上榜-未上榜$/;

function stripHtmlTags(s) {
  return String(s).replace(/<[^>]+>/g, "");
}

function compactDisplayRankLines(lines) {
  if (!lines || lines.length === 0) return [];
  const allUnlisted = lines.every((ln) => RE_LINE_UNLISTED_FLAT.test(stripHtmlTags(ln)));
  if (allUnlisted) {
    return ["各分榜均未上榜，环比持平"];
  }
  return lines;
}

function normalizeCategoryForIntro(q) {
  let c = String(q.category);
  const m = /^category_(\d+)$/.exec(c);
  if (m) c = m[1];
  return c;
}

/** iOS Games 总榜 / Android game 类总榜，用于顶部「游戏 + 端」摘要 */
function isGameTotalBoardQuery(q) {
  const c = normalizeCategoryForIntro(q);
  return c === "6014" || c === "game";
}

function introPlatformTag(q) {
  if (q.os === "android") return "android";
  return q.device === "ipad" ? "ipad" : "ios";
}

const INTRO_PLATFORM_ORDER = { ios: 0, android: 1, ipad: 2 };

function introGameEntryHasChange(o, n) {
  if (o == null && n == null) return false;
  if (o == null && n != null) return true;
  if (o != null && n == null) return true;
  if (o === n) return false;
  return true;
}

function formatIntroRankToken(r) {
  if (r == null) return "未上榜";
  return String(r);
}

function formatIntroRankPair(o, n) {
  return `${formatIntroRankToken(o)}→${formatIntroRankToken(n)}`;
}

function sortIntroEntriesByPlatform(entries) {
  return [...entries].sort(
    (a, b) =>
      (INTRO_PLATFORM_ORDER[introPlatformTag(a.q)] ?? 99) -
      (INTRO_PLATFORM_ORDER[introPlatformTag(b.q)] ?? 99),
  );
}

/**
 * 游戏名后全角括号：仅 **ios / android** 游戏总榜环比（不含 iPad；iPad 见下方明细）
 */
function buildIosAndroidGameTotalParen(block) {
  const entries = (block.rankEntries || []).filter((e) => isGameTotalBoardQuery(e.q));
  const changed = entries.filter((e) => introGameEntryHasChange(e.oldRank, e.newRank));
  const iosAndroid = changed.filter((e) => {
    const t = introPlatformTag(e.q);
    return t === "ios" || t === "android";
  });
  const sorted = sortIntroEntriesByPlatform(iosAndroid);
  if (sorted.length === 0) return "";
  const parts = sorted.map(
    (e) => `${introPlatformTag(e.q)} ${formatIntroRankPair(e.oldRank, e.newRank)}`,
  );
  return `（${parts.join("，")}）`;
}

/** 顶部摘要是否展示：仅当 ios 或 android 游戏总榜有变化（仅 iPad 变化不进摘要） */
function productHasIosAndroidGameTotalChange(block) {
  const entries = (block.rankEntries || []).filter((e) => isGameTotalBoardQuery(e.q));
  return entries.some((e) => {
    const t = introPlatformTag(e.q);
    if (t !== "ios" && t !== "android") return false;
    return introGameEntryHasChange(e.oldRank, e.newRank);
  });
}

function sortBlocksByLabel(blocks) {
  return [...blocks].sort((a, b) =>
    linkTitleForProduct(a).localeCompare(linkTitleForProduct(b), "zh-CN"),
  );
}

/** internal_name 形如「本品·竞品·竞品名」时挂到本品折叠块下 */
const RE_COMPETITOR_INTERNAL = /^(.+)·竞品·(.+)$/;

/**
 * 将竞品块合并进对应本品块 competitorPanels；无法匹配本品的竞品仍作独立块排在后面。
 * @returns {Array}
 */
function mergeCompetitorBlocksIntoParents(blocks) {
  if (!blocks || !blocks.length) return blocks;
  const byParent = new Map();
  const parents = [];
  for (const b of blocks) {
    const m = RE_COMPETITOR_INTERNAL.exec(String(b.internalName || ""));
    if (m) {
      const parentKey = m[1];
      if (!byParent.has(parentKey)) byParent.set(parentKey, []);
      byParent.get(parentKey).push(b);
    } else {
      parents.push(b);
    }
  }
  for (const p of parents) {
    const comps = byParent.get(p.internalName);
    if (comps && comps.length) {
      p.competitorPanels = comps
        .sort((a, b) =>
          String(a.displayName || "").localeCompare(String(b.displayName || ""), "zh-CN"),
        )
        .map((c) => {
          c.feishuLabel = String(c.displayName || "").trim() || String(c.internalName || "");
          return c;
        });
      byParent.delete(p.internalName);
    } else {
      p.competitorPanels = [];
    }
  }
  const orphans = [];
  for (const arr of byParent.values()) orphans.push(...arr);
  orphans.sort((a, b) => linkTitleForProduct(a).localeCompare(linkTitleForProduct(b), "zh-CN"));
  return parents.concat(orphans);
}

/** 按 rankEntries 与 isGameTotalBoardQuery 拆成游戏总榜行 vs 其余分榜行 */
function partitionRankLinesByGameTotal(block) {
  const entries = block.rankEntries || [];
  const feishu = block.rankLines || [];
  const plain = block.plainRankLines || [];
  const totalF = [];
  const restF = [];
  const totalP = [];
  const restP = [];
  for (let i = 0; i < entries.length; i++) {
    if (isGameTotalBoardQuery(entries[i].q)) {
      totalF.push(feishu[i]);
      totalP.push(plain[i]);
    } else {
      restF.push(feishu[i]);
      restP.push(plain[i]);
    }
  }
  return { totalF, restF, totalP, restP };
}

/**
 * 竞品：默认只展示游戏总榜；其余分榜放入内层折叠。
 * @param {{ titleInPanel?: boolean }} [opts] 为 true 时外层 collapsible 标题已含「竞品·名」，正文不再重复大标题
 */
function buildCompetitorGameTotalMarkdown(c, opts) {
  const titleInPanel = opts && opts.titleInPanel;
  const ids = c.ids || {};
  const st = sensorTowerUrlForIds(ids);
  const linkLabel = linkTitleForProduct(c);
  const parts = [];
  if (st) parts.push(`[${escapeMdLinkLabel(linkLabel)}](${st})`);
  else parts.push(escapeMdLinkLabel(linkLabel));
  if (ids.apple_app_id) parts.push(`[前往 Apple Store](${appleStoreUrl(ids.apple_app_id)})`);
  if (ids.google_app_id) parts.push(`[前往 Google Play](${googlePlayUrl(ids.google_app_id)})`);
  const headerMd = parts.join("  ");
  const { totalF } = partitionRankLinesByGameTotal(c);
  const lines = compactDisplayRankLines(totalF);
  const body = lines.join("\n");
  const linkBlock = `**快捷链接** · ${headerMd}`;
  const head = titleInPanel
    ? linkBlock
    : `**竞品 · ${escapeMdLinkLabel(linkLabel)}**\n\n${linkBlock}`;
  if (body) return `${head}\n\n**游戏总榜（各端）**\n${body}`;
  return `${head}\n\n**游戏总榜（各端）**\n（无）`;
}

function buildCompetitorRestMarkdown(c) {
  const { restF } = partitionRankLinesByGameTotal(c);
  const lines = compactDisplayRankLines(restF);
  const body = lines.join("\n");
  if (!body) return "";
  return `**各维度排名（非游戏总榜）**\n${body}`;
}

/** 折叠块内 Markdown：备注 + 快捷链接 + 各维度排名（本品与竞品复用） */
function buildRankPanelMarkdownBody(block) {
  const ids = block.ids || {};
  const st = sensorTowerUrlForIds(ids);
  const linkLabel = linkTitleForProduct(block);
  const parts = [];
  if (st) {
    parts.push(`[${escapeMdLinkLabel(linkLabel)}](${st})`);
  } else {
    parts.push(escapeMdLinkLabel(linkLabel));
  }
  if (ids.apple_app_id) parts.push(`[前往 Apple Store](${appleStoreUrl(ids.apple_app_id)})`);
  if (ids.google_app_id) parts.push(`[前往 Google Play](${googlePlayUrl(ids.google_app_id)})`);
  const headerMd = parts.join("  ");
  const noteLine = block.weeklySummaryNote
    ? `**备注** · ${block.weeklySummaryNote}\n\n`
    : "";
  const lines = compactDisplayRankLines(block.rankLines || []);
  const body = lines.join("\n");
  if (body) {
    return `${noteLine}**快捷链接** · ${headerMd}\n\n**各维度排名**\n${body}`;
  }
  return `${noteLine}**快捷链接** · ${headerMd}`;
}

function buildTotalBoardChangedIntroMarkdown(productBlocks) {
  const qual = productBlocks.filter((b) => productHasIosAndroidGameTotalChange(b));
  const sorted = sortBlocksByLabel(qual);
  if (sorted.length === 0) {
    return "**提示** · 本周 **ios / android** 游戏总榜无可用变化（iPad 等见下方明细）；下方为全部分榜明细，按首字母排序。";
  }
  const chunks = sorted.map((b) => {
    const name = linkTitleForProduct(b);
    const st = sensorTowerUrlForIds(b.ids || {});
    const head = st
      ? `- [**${escapeMdLinkLabel(name)}**](${st})`
      : `- **${escapeMdLinkLabel(name)}**`;
    return `${head}${buildIosAndroidGameTotalParen(b)}`;
  });
  return (
    "**游戏总榜（ios / android）** · 有变化产品（按首字母）\n\n" +
      "游戏名后括号为 **ios / android** 环比；iPad 等见下方；**详情见下方**各产品折叠。\n\n" +
      chunks.join("\n")
  );
}

function apiCacheKey(q, dateStr) {
  return `${q.os}|${q.app_ids[0]}|${q.category}|${q.chart_type_ids[0]}|${dateStr}`;
}

function callCategoryHistoryApiOnce(q, dateStr, token) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const params = new URLSearchParams({
      app_ids: q.app_ids.join(","),
      category: q.category,
      chart_type_ids: q.chart_type_ids.join(","),
      countries: COUNTRY,
      start_date: dateStr,
      end_date: dateStr,
    });

    const options = {
      hostname: SENSORTOWER_API_HOST,
      path: `/v1/${q.os}/category/category_history?${params.toString()}`,
      method: "GET",
      agent: httpsAgent,
      headers: {
        Authorization: `Bearer ${token}`,
        Connection: "close",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        req.setTimeout(0);
        if (res.statusCode && res.statusCode >= 400) {
          console.error(`[WARN] HTTP ${res.statusCode}: ${data.slice(0, 200)}`);
          done(null);
          return;
        }
        try {
          done(JSON.parse(data));
        } catch (e) {
          console.error(`[WARN] Parse error: ${data.slice(0, 200)}`);
          done(null);
        }
      });
    });

    req.on("error", (e) => {
      req.setTimeout(0);
      console.error(`[WARN] Request error: ${e.message}`);
      done(null);
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.setTimeout(0);
      req.destroy();
      console.error(`[WARN] Timeout (${REQUEST_TIMEOUT_MS}ms)`);
      done(null);
    });

    req.end();
  });
}

async function callCategoryHistoryApi(q, dateStr, token) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const data = await callCategoryHistoryApiOnce(q, dateStr, token);
    if (data !== null) return data;
    if (attempt < MAX_RETRIES) {
      const backoff = Math.min(2500 * 2 ** (attempt - 1), 45000);
      console.error(`       → 第 ${attempt}/${MAX_RETRIES} 次失败，${Math.round(backoff / 1000)}s 后重试...`);
      await sleep(backoff);
    }
  }
  return null;
}

async function fetchRanksForDate(sqlDb, dateStr, flatQueries, token, apiCache) {
  const results = {};
  const pending = [];

  for (const item of flatQueries) {
    const { internal_name, q } = item;
    const key = queryResultKey(internal_name, q);
    const ck = apiCacheKey(q, dateStr);

    let rank = null;
    let fromDb = false;

    const stmt = sqlDb.prepare(
      `SELECT rank FROM app_ranks WHERE internal_name = ? AND country = ? AND platform = ? AND device = ? AND chart_type = ? AND category = ? AND app_id = ? AND rank_date = ?`
    );
    stmt.bind([
      internal_name,
      COUNTRY,
      q.os,
      q.device,
      q.chart_type_ids[0],
      q.category,
      q.app_ids[0],
      dateStr,
    ]);
    if (stmt.step()) {
      const row = stmt.get();
      rank = row[0];
      fromDb = true;
    }
    stmt.free();

    if (fromDb) {
      process.stdout.write(` [DB] ${internal_name} ${q.device}/${q.category_name} `);
      console.log(rank != null ? `#${rank}` : "未上榜");
      results[key] = rank;
      continue;
    }

    if (apiCache.has(ck)) {
      rank = apiCache.get(ck);
      process.stdout.write(` [缓存] ${internal_name} ${q.device}/${q.category_name} `);
      console.log(rank != null ? `#${rank}` : "未上榜");
      results[key] = rank;
      continue;
    }

    pending.push({ item, key, ck, internal_name, q });
  }

  const groups = new Map();
  for (const p of pending) {
    const gk = categoryHistoryBatchKey(p.q);
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(p);
  }

  let batchSeq = 0;
  for (const plist of groups.values()) {
    const uniqApps = [];
    const seenApp = new Set();
    for (const p of plist) {
      const aid = String(p.q.app_ids[0]);
      if (!seenApp.has(aid)) {
        seenApp.add(aid);
        uniqApps.push(aid);
      }
    }

    const qTemplate = plist[0].q;
    for (const chunk of chunkArray(uniqApps, CATEGORY_HISTORY_APP_IDS_BATCH)) {
      if (batchSeq++ > 0) await sleep(BETWEEN_QUERIES_MS);
      const qBatch = { ...qTemplate, app_ids: chunk };
      const chunkSet = new Set(chunk);
      process.stdout.write(
        ` [API batch ${chunk.length} app_ids] ${qTemplate.os} ${qTemplate.device}/${qTemplate.category_name || qTemplate.category} `
      );
      const data = await callCategoryHistoryApi(qBatch, dateStr, token);
      console.log(data ? "OK" : "FAIL");

      for (const p of plist) {
        if (!chunkSet.has(String(p.q.app_ids[0]))) continue;
        const rank = data ? getRankFromData(data, p.q, dateStr) : null;
        apiCache.set(p.ck, rank);
        results[p.key] = rank;
        process.stdout.write(` [API] ${p.internal_name} ${p.q.device}/${p.q.category_name} `);
        console.log(rank != null ? `#${rank}` : "未上榜");
        sqlDb.run(
          `INSERT OR REPLACE INTO app_ranks (internal_name, product_code, display_name, country, platform, device, chart_type, category, category_name, app_id, rank_date, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.internal_name,
            p.item.product_code || "",
            p.item.display_name || "",
            COUNTRY,
            p.q.os,
            p.q.device,
            p.q.chart_type_ids[0],
            p.q.category,
            p.q.category_name,
            p.q.app_ids[0],
            dateStr,
            rank,
          ]
        );
      }
    }
  }

  return results;
}

function chunkText(s, maxLen) {
  if (!s) return [""];
  const out = [];
  let i = 0;
  while (i < s.length) {
    out.push(s.slice(i, i + maxLen));
    i += maxLen;
  }
  return out;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 同一 category_history 请求：同 os、device、category、chart_type（不含 app_id） */
function categoryHistoryBatchKey(q) {
  return `${q.os}|${q.device}|${q.category}|${q.chart_type_ids[0]}`;
}

/**
 * rank_changes.country（如 🇺🇸 美国）或两位 ISO → 两位国家码；无法识别时 US（对齐 Python _country_to_code）
 */
function countryToCode(country) {
  if (country == null || String(country).trim() === "") return "US";
  const s = String(country).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const lower = s.toLowerCase();
  if (lower.includes("美国") || lower === "usa" || lower.includes("united states") || s.includes("🇺🇸"))
    return "US";
  if (lower.includes("英国") || s.includes("🇬🇧") || lower === "uk") return "GB";
  if (lower.includes("日本") || s.includes("🇯🇵") || lower === "jp") return "JP";
  if (lower.includes("中国") || s.includes("🇨🇳") || lower === "cn") return "CN";
  if (lower.includes("韩国") || s.includes("🇰🇷") || lower === "kr") return "KR";
  return "US";
}

function sensortowerOverviewBase() {
  return (process.env.SENSORTOWER_OVERVIEW_BASE || SENSORTOWER_OVERVIEW_BASE_DEFAULT).replace(/\/+$/, "");
}

/**
 * 与 Python _sensortower_overview_url 一致：
 * - 有 project_id：`{base}/overview/{project_id}/{app_id}?country={code}`
 * - 无：`{base}/overview/{app_id}?country={code}`
 */
function sensorTowerOverviewUrl(appId, countryRaw, projectId) {
  const base = sensortowerOverviewBase();
  const code = countryToCode(countryRaw);
  const app = String(appId).trim();
  if (!app) return null;
  const pid = projectId && String(projectId).trim();
  const q = `country=${encodeURIComponent(code)}`;
  if (pid) {
    return `${base}/overview/${pid}/${app}?${q}`;
  }
  return `${base}/overview/${app}?${q}`;
}

function sensorTowerUrlForIds(ids) {
  if (!ids) return null;
  const country = ids.country != null && ids.country !== "" ? ids.country : COUNTRY;
  const projectId =
    (ids.st_overview_parent_id && String(ids.st_overview_parent_id).trim()) ||
    (process.env.ST_CHINA_OVERVIEW_PARENT_ID && String(process.env.ST_CHINA_OVERVIEW_PARENT_ID).trim()) ||
    (process.env.SENSORTOWER_OVERVIEW_PROJECT_ID && String(process.env.SENSORTOWER_OVERVIEW_PROJECT_ID).trim()) ||
    "";

  if (ids.apple_app_id) {
    return sensorTowerOverviewUrl(String(ids.apple_app_id).trim(), country, projectId);
  }
  if (ids.google_app_id) {
    return sensorTowerOverviewUrl(String(ids.google_app_id).trim(), country, projectId);
  }
  return null;
}

/** 美国区 App Store 应用页 */
function appleStoreUrl(appleId) {
  return `https://apps.apple.com/us/app/id${String(appleId).trim()}`;
}

/** Google Play 美国区详情页 */
function googlePlayUrl(packageName) {
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(String(packageName).trim())}&gl=US`;
}

/** 飞书 markdown 链接文案中避免破坏 [] 解析 */
function escapeMdLinkLabel(s) {
  return String(s).replace(/\]/g, "﹞").replace(/\[/g, "﹝");
}

/** 飞书 plain_text 标题最长约 56 字；优先保留末尾括号（ios/android 环比） */
function feishuTruncateWithOptionalParen(base, paren) {
  const max = 56;
  const b = String(base || "").trim() || "产品";
  const p = paren ? String(paren) : "";
  if (!p) return b.length <= max ? b : `${b.slice(0, max - 1)}…`;
  const full = `${b}${p}`;
  if (full.length <= max) return full;
  const room = max - p.length;
  if (room < 4) return `${b.slice(0, max - 1)}…`;
  return `${b.slice(0, room - 1)}…${p}`;
}

/** 折叠面板标题：内部名（含重名后缀）；含竞品数量；游戏名后接 ios/android 括号环比 */
function feishuPanelTitleFromProduct(block) {
  let t = linkTitleForProduct(block).trim() || "产品";
  const n = (block.competitorPanels || []).length;
  if (n > 0) t = `${t} · ${n}竞品`;
  const paren = buildIosAndroidGameTotalParen(block);
  return feishuTruncateWithOptionalParen(t, paren);
}

/** 竞品游戏总榜折叠标题：竞品 · 名（ios…，android…） */
function feishuCompetitorGameTotalPanelTitle(c) {
  const base = `竞品 · ${linkTitleForProduct(c).trim() || "竞品"}`;
  const paren = buildIosAndroidGameTotalParen(c);
  return feishuTruncateWithOptionalParen(base, paren);
}

function buildFeishuCard(dateOld, dateNew, productBlocks) {
  const sortedBlocks = sortBlocksByLabel(productBlocks);
  const elements = [];
  elements.push({
    tag: "markdown",
    content: [
      "**📍 美国 US** · 免费榜（iPhone / iPad / Android）",
      "",
      "**在榜** · 名次位于前500名以内；**未上榜** · 未进入前500。",
      "",
      `**环比** · ${dateOld} → ${dateNew}`,
    ].join("\n"),
  });
  elements.push({ tag: "hr" });
  elements.push({
    tag: "markdown",
    content: buildTotalBoardChangedIntroMarkdown(productBlocks),
  });
  elements.push({ tag: "hr" });
  elements.push({
    tag: "markdown",
    content:
      "**📋 分榜明细（过去七天）**\n\n下列按**产品内部名首字母**排序；点击标题栏展开**快捷链接**与各维度排名。",
  });

  if (!sortedBlocks || sortedBlocks.length === 0) {
    elements.push({
      tag: "div",
      text: { tag: "plain_text", content: "（无数据）" },
    });
  } else {
    const rankExpanded =
      String(process.env.FEISHU_RANK_DETAIL_EXPANDED || "").trim() === "1" ||
      String(process.env.FEISHU_RANK_DETAIL_EXPANDED || "").toLowerCase() === "true";
    const panelShell = {
      tag: "collapsible_panel",
      expanded: rankExpanded,
      background_color: "grey",
      header: {
        title: { tag: "plain_text", content: "" },
        vertical_align: "center",
        icon: {
          tag: "standard_icon",
          token: "down-small-ccm_outlined",
          color: "",
          size: "16px 16px",
        },
        icon_position: "right",
        icon_expanded_angle: -180,
      },
      border: {
        color: "grey",
        corner_radius: "5px",
      },
      vertical_spacing: "8px",
      padding: "8px",
      elements: [],
    };
    const nestedPanelShell = {
      tag: "collapsible_panel",
      expanded: false,
      background_color: "grey",
      header: {
        title: { tag: "plain_text", content: "" },
        vertical_align: "center",
        icon: {
          tag: "standard_icon",
          token: "down-small-ccm_outlined",
          color: "",
          size: "16px 16px",
        },
        icon_position: "right",
        icon_expanded_angle: -180,
      },
      border: {
        color: "grey",
        corner_radius: "5px",
      },
      vertical_spacing: "8px",
      padding: "8px",
      elements: [],
    };
    for (let i = 0; i < sortedBlocks.length; i++) {
      const block = sortedBlocks[i];
      const panelElements = [];
      panelElements.push({ tag: "markdown", content: buildRankPanelMarkdownBody(block) });
      const comps = block.competitorPanels || [];
      for (const c of comps) {
        const compTitle = feishuCompetitorGameTotalPanelTitle(c);
        const compMd = buildCompetitorGameTotalMarkdown(c, { titleInPanel: true });
        panelElements.push({
          ...nestedPanelShell,
          header: {
            ...nestedPanelShell.header,
            title: { tag: "plain_text", content: compTitle },
          },
          elements: [{ tag: "markdown", content: compMd }],
        });
        const restMd = buildCompetitorRestMarkdown(c);
        if (restMd) {
          let subTitle = `竞品 · ${linkTitleForProduct(c)} · 其他分榜`;
          subTitle = feishuTruncateWithOptionalParen(subTitle, buildIosAndroidGameTotalParen(c));
          panelElements.push({
            ...nestedPanelShell,
            header: {
              ...nestedPanelShell.header,
              title: { tag: "plain_text", content: subTitle },
            },
            elements: [{ tag: "markdown", content: restMd }],
          });
        }
      }
      elements.push({
        ...panelShell,
        header: {
          ...panelShell.header,
          title: {
            tag: "plain_text",
            content: feishuPanelTitleFromProduct(block),
          },
        },
        elements: panelElements,
      });
    }
  }

  elements.push({ tag: "hr" });
  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `US Free AppID Weekly · ${new Date().toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          hour12: false,
        })}`,
      },
    ],
  });

  const title = `公司自有产品 SensorTower US 免费榜排名变化 ${dateOld}～${dateNew}`;

  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true, enable_forward: true },
      header: {
        template: "turquoise",
        title: { tag: "plain_text", content: title },
      },
      elements,
    },
  };
}

function sendFeishuMessage(webhookUrl, cardPayload) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(cardPayload);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      port: 443,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0 || json.StatusCode === 0) resolve(json);
          else {
            const err = new Error(`Feishu error: ${data.slice(0, 400)}`);
            err.feishuJson = json;
            reject(err);
          }
        } catch (e) {
          reject(new Error(`Feishu parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Feishu timeout"));
    });
    req.write(body);
    req.end();
  });
}

/** 单条交互卡片推送整份周报；遇 11232 频率限制则退避重试 */
async function sendFeishuWeeklyCard(webhookUrl, dateOld, dateNew, productBlocks, productCount, lineCount) {
  console.log(`飞书将发送 1 条消息（含 ${productBlocks.length} 个产品）`);
  const card = buildFeishuCard(dateOld, dateNew, productBlocks);
  let attempt = 0;
  const maxAttempts = 5;
  while (attempt < maxAttempts) {
    try {
      await sendFeishuMessage(webhookUrl, card);
      console.log("飞书已发送");
      return;
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      const code11232 =
        msg.includes("11232") || (e.feishuJson && e.feishuJson.code === 11232);
      attempt++;
      if (code11232 && attempt < maxAttempts) {
        const wait = Math.min(8000 * attempt, 60000);
        console.error(`飞书频率限制 (11232)，${wait / 1000}s 后重试 (${attempt}/${maxAttempts})…`);
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
}

/**
 * 仅从本地 DB 读取两期 rank，重建简报并推送飞书（不调 SensorTower API）
 */
async function feishuOnlyMain() {
  const raw = process.argv.slice(2).filter((a) => a !== "--feishu-only");
  let DATE_NEW;
  let DATE_OLD;
  if (raw[0] && /^\d{4}-\d{2}-\d{2}$/.test(raw[0])) {
    DATE_NEW = raw[0];
    DATE_OLD = raw[1] && /^\d{4}-\d{2}-\d{2}$/.test(raw[1]) ? raw[1] : addDays(DATE_NEW, -7);
  } else {
    DATE_NEW = getLastSunday();
    DATE_OLD = addDays(DATE_NEW, -7);
  }

  loadEnv(path.join(ROOT, ".env"));
  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!webhook) {
    console.error("缺少 FEISHU_WEBHOOK_URL");
    process.exit(1);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error(`数据库不存在: ${DB_PATH}，请先跑完整周报脚本`);
    process.exit(1);
  }

  const list = JSON.parse(fs.readFileSync(APPID_US_JSON, "utf-8"));

  let flatQueries = [];
  for (const row of list) {
    const qs = expandQueriesForApp(row);
    if (qs.length === 0) continue;
    flatQueries.push(...qs);
  }
  const beforeDedupe = flatQueries.length;
  flatQueries = dedupeFlatQueries(flatQueries);
  if (flatQueries.length < beforeDedupe) {
    console.log(`维度去重：${beforeDedupe} → ${flatQueries.length}（去掉重复 internal_name+同榜同包）\n`);
  }

  if (flatQueries.length === 0) {
    console.error("没有可展开的维度，请检查 appid_us.json");
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  function loadRanksForDate(dateStr) {
    const map = {};
    const stmt = db.prepare(
      `SELECT internal_name, platform, device, chart_type, category, app_id, rank FROM app_ranks WHERE country = ? AND rank_date = ?`
    );
    stmt.bind([COUNTRY, dateStr]);
    while (stmt.step()) {
      const row = stmt.get();
      const internalName = row[0];
      const q = {
        os: row[1],
        device: row[2],
        chart_type_ids: [row[3]],
        category: row[4],
        app_ids: [row[5]],
      };
      const k = queryResultKey(internalName, q);
      map[k] = row[6];
    }
    stmt.free();
    return map;
  }

  const oldRanks = loadRanksForDate(DATE_OLD);
  const newRanks = loadRanksForDate(DATE_NEW);
  db.close();

  const byProduct = new Map();
  for (const item of flatQueries) {
    const k = queryResultKey(item.internal_name, item.q);
    const o = oldRanks[k] !== undefined ? oldRanks[k] : null;
    const n = newRanks[k] !== undefined ? newRanks[k] : null;
    const line = formatRankCompactLine(item.q, o, n);
    const lineFeishu = formatRankCompactLineFeishu(item.q, o, n);
    const gk = productGroupKey(item);
    if (!byProduct.has(gk)) {
      byProduct.set(gk, {
        internal_name: item.internal_name,
        product_code: item.product_code,
        display_name: item.display_name,
        apple_app_id: item.apple_app_id,
        google_app_id: item.google_app_id,
        country: item.country || COUNTRY,
        st_overview_parent_id: item.st_overview_parent_id || null,
        weekly_note: item.us_free_weekly_note || null,
        competitor_parent: item.competitorParent != null ? item.competitorParent : null,
        lines: [],
        feishuLines: [],
        rankEntries: [],
      });
    }
    const bucket = byProduct.get(gk);
    bucket.lines.push(line);
    bucket.feishuLines.push(lineFeishu);
    bucket.rankEntries.push({ q: item.q, oldRank: o, newRank: n });
  }

  if (byProduct.size === 0) {
    console.error(`库中无 ${DATE_OLD} / ${DATE_NEW} 的排名数据，请先跑完整脚本写入 app_ranks`);
    process.exit(1);
  }

  const lineCount = [...byProduct.values()].reduce((s, x) => s + x.lines.length, 0);
  const productBlocks = [];
  for (const info of byProduct.values()) {
    productBlocks.push({
      internalName: info.internal_name,
      productCode: info.product_code,
      displayName: info.display_name,
      ids: {
        apple_app_id: info.apple_app_id,
        google_app_id: info.google_app_id,
        country: info.country,
        st_overview_parent_id: info.st_overview_parent_id,
      },
      rankLines: info.feishuLines,
      plainRankLines: info.lines,
      rankEntries: info.rankEntries,
      weeklySummaryNote: info.weekly_note || null,
      competitorParent: info.competitor_parent || null,
    });
  }

  const mergedBlocks = mergeCompetitorBlocksIntoParents(productBlocks);
  assignInternalNameLabels(mergedBlocks);

  console.log(
    `仅飞书推送：${DATE_OLD} → ${DATE_NEW}，折叠块 ${mergedBlocks.length} 个（含竞品已并入本品），维度 ${lineCount}`,
  );

  await sendFeishuWeeklyCard(webhook, DATE_OLD, DATE_NEW, mergedBlocks, mergedBlocks.length, lineCount);
  console.log("飞书推送完成");
}

async function main() {
  if (process.argv.includes("--feishu-only")) {
    await feishuOnlyMain();
    return;
  }

  const argv = process.argv.slice(2).filter((a) => a !== "--no-feishu");
  const noFeishu = process.argv.includes("--no-feishu");

  let DATE_NEW;
  let DATE_OLD;
  if (argv[0] && /^\d{4}-\d{2}-\d{2}$/.test(argv[0])) {
    DATE_NEW = argv[0];
    DATE_OLD = argv[1] && /^\d{4}-\d{2}-\d{2}$/.test(argv[1]) ? argv[1] : addDays(DATE_NEW, -7);
  } else {
    DATE_NEW = getLastSunday();
    DATE_OLD = addDays(DATE_NEW, -7);
  }

  loadEnv(path.join(ROOT, ".env"));
  const token = process.env.SENSORTOWER_API_TOKEN;
  if (!token) {
    console.error("缺少 SENSORTOWER_API_TOKEN");
    process.exit(1);
  }

  const list = JSON.parse(fs.readFileSync(APPID_US_JSON, "utf-8"));

  let flatQueries = [];
  let skipped = 0;
  for (const row of list) {
    const qs = expandQueriesForApp(row);
    if (qs.length === 0) {
      skipped++;
      continue;
    }
    flatQueries.push(...qs);
  }
  const beforeDedupe = flatQueries.length;
  flatQueries = dedupeFlatQueries(flatQueries);
  if (flatQueries.length < beforeDedupe) {
    console.log(`维度去重：${beforeDedupe} → ${flatQueries.length}`);
  }

  console.log(`日期：上上周日 ${DATE_OLD} → 上周日 ${DATE_NEW}`);
  console.log(`展开维度条数：${flatQueries.length}（跳过无 summary 或无维度的产品：${skipped}）\n`);

  if (flatQueries.length === 0) {
    console.error("没有可查询的维度，请检查 appid_us.json 中 us_free_category_ranking_summary");
    process.exit(1);
  }

  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS app_ranks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      internal_name TEXT NOT NULL,
      product_code TEXT,
      display_name TEXT,
      country VARCHAR(8) NOT NULL,
      platform VARCHAR(16) NOT NULL,
      device VARCHAR(16) NOT NULL,
      chart_type VARCHAR(64) NOT NULL,
      category VARCHAR(64) NOT NULL,
      category_name VARCHAR(128) NOT NULL,
      app_id VARCHAR(256) NOT NULL,
      rank_date DATE NOT NULL,
      rank INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(internal_name, platform, device, chart_type, category, app_id, rank_date)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS weekly_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      summary_text TEXT NOT NULL,
      product_count INTEGER,
      line_count INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  const apiCache = new Map();

  console.log(`=== ${DATE_OLD} ===`);
  const oldRanks = await fetchRanksForDate(db, DATE_OLD, flatQueries, token, apiCache);
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  console.log(`\n=== ${DATE_NEW} ===`);
  const newRanks = await fetchRanksForDate(db, DATE_NEW, flatQueries, token, apiCache);
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  const byProduct = new Map();
  for (const item of flatQueries) {
    const k = queryResultKey(item.internal_name, item.q);
    const o = oldRanks[k] !== undefined ? oldRanks[k] : null;
    const n = newRanks[k] !== undefined ? newRanks[k] : null;
    const line = formatRankCompactLine(item.q, o, n);
    const lineFeishu = formatRankCompactLineFeishu(item.q, o, n);
    const gk = productGroupKey(item);
    if (!byProduct.has(gk)) {
      byProduct.set(gk, {
        internal_name: item.internal_name,
        product_code: item.product_code,
        display_name: item.display_name,
        apple_app_id: item.apple_app_id,
        google_app_id: item.google_app_id,
        country: item.country || COUNTRY,
        st_overview_parent_id: item.st_overview_parent_id || null,
        weekly_note: item.us_free_weekly_note || null,
        competitor_parent: item.competitorParent != null ? item.competitorParent : null,
        lines: [],
        feishuLines: [],
        rankEntries: [],
      });
    }
    const bucket = byProduct.get(gk);
    bucket.lines.push(line);
    bucket.feishuLines.push(lineFeishu);
    bucket.rankEntries.push({ q: item.q, oldRank: o, newRank: n });
  }

  const productBlocks = [];
  for (const info of byProduct.values()) {
    productBlocks.push({
      internalName: info.internal_name,
      productCode: info.product_code,
      displayName: info.display_name,
      ids: {
        apple_app_id: info.apple_app_id,
        google_app_id: info.google_app_id,
        country: info.country,
        st_overview_parent_id: info.st_overview_parent_id,
      },
      rankLines: info.feishuLines,
      plainRankLines: info.lines,
      rankEntries: info.rankEntries,
      weeklySummaryNote: info.weekly_note || null,
      competitorParent: info.competitor_parent || null,
    });
  }
  const mergedBlocks = mergeCompetitorBlocksIntoParents(productBlocks);
  assignInternalNameLabels(mergedBlocks);
  const summaryLines = [];
  for (const block of mergedBlocks) {
    const ids = block.ids;
    summaryLines.push(`【${linkTitleForProduct(block)}】`);
    if (block.weeklySummaryNote) summaryLines.push(`备注：${block.weeklySummaryNote}`);
    const st = sensorTowerUrlForIds(ids);
    if (st) summaryLines.push(`SensorTower: ${st}`);
    if (ids.apple_app_id) summaryLines.push(`Apple Store: ${appleStoreUrl(ids.apple_app_id)}`);
    if (ids.google_app_id) summaryLines.push(`Google Play: ${googlePlayUrl(ids.google_app_id)}`);
    summaryLines.push(...(block.plainRankLines || []));
    const comps = block.competitorPanels || [];
    for (const c of comps) {
      summaryLines.push("");
      summaryLines.push(`—— 竞品：${linkTitleForProduct(c)} ——`);
      const cid = c.ids || {};
      const cst = sensorTowerUrlForIds(cid);
      if (cst) summaryLines.push(`SensorTower: ${cst}`);
      if (cid.apple_app_id) summaryLines.push(`Apple Store: ${appleStoreUrl(cid.apple_app_id)}`);
      if (cid.google_app_id) summaryLines.push(`Google Play: ${googlePlayUrl(cid.google_app_id)}`);
      const { totalP, restP } = partitionRankLinesByGameTotal(c);
      summaryLines.push("【游戏总榜】");
      if (totalP.length) summaryLines.push(...totalP);
      else summaryLines.push("（无游戏总榜维度）");
      if (restP.length) {
        summaryLines.push("【其他分榜】");
        summaryLines.push(...restP);
      }
    }
    summaryLines.push("");
  }
  const summaryText = summaryLines.join("\n").trim();
  const lineCount = flatQueries.length;

  db.run(`INSERT INTO weekly_summaries (date_from, date_to, summary_text, product_count, line_count) VALUES (?, ?, ?, ?, ?)`, [
    DATE_OLD,
    DATE_NEW,
    summaryText,
    mergedBlocks.length,
    lineCount,
  ]);
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();

  const outTxt = path.join(ROOT, "data", `us_free_appid_weekly_${DATE_OLD}_${DATE_NEW}.txt`);
  fs.writeFileSync(outTxt, summaryText + "\n", "utf-8");
  console.log(`\n简报已写: ${outTxt}`);
  console.log(`数据库: ${DB_PATH}`);

  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!noFeishu) {
    if (!webhook) {
      console.warn("未配置 FEISHU_WEBHOOK_URL，跳过飞书（可用 --no-feishu 消除本提示）");
    } else {
      try {
        await sendFeishuWeeklyCard(webhook, DATE_OLD, DATE_NEW, mergedBlocks, mergedBlocks.length, lineCount);
        console.log("飞书推送完成");
      } catch (e) {
        console.error("飞书推送失败:", e.message);
      }
    }
  }
}

/** 自测：node scripts/us_free_appid_weekly_rank_changes.js --verify-urls */
async function verifySampleUrls() {
  loadEnv(path.join(ROOT, ".env"));
  const sample = { apple_app_id: "1492978794", google_app_id: "sudoku.puzzle.free.game.brain" };
  const rows = [
    ["SensorTower (iOS)", sensorTowerUrlForIds({ apple_app_id: sample.apple_app_id })],
    ["SensorTower (Android)", sensorTowerUrlForIds({ google_app_id: sample.google_app_id })],
    ["App Store", appleStoreUrl(sample.apple_app_id)],
    ["Google Play", googlePlayUrl(sample.google_app_id)],
  ];
  const https = require("https");
  for (const [label, url] of rows) {
    if (!url) {
      console.log(`${label}: (无 URL)`);
      continue;
    }
    const ok = await new Promise((resolve) => {
      const opts = {
        timeout: 20000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; sensortower-weekly/1.0; +https://github.com/) Chrome/120.0.0.0 Safari/537.36",
        },
      };
      const req = https.get(url, opts, (res) => {
        res.resume();
        const code = res.statusCode || 0;
        resolve(code >= 200 && code < 400);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
    console.log(`${ok ? "OK" : "FAIL"} ${label}\n  ${url}`);
  }
}

if (process.argv.includes("--verify-urls")) {
  verifySampleUrls()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
