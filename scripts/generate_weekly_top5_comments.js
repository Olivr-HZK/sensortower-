#!/usr/bin/env node
/**
 * 为每个周一的 Top100 榜单（按平台 + 国家 + 榜单类型）生成「前五名最近一周排名变化」的一句话简要描述，
 * 写入 SQLite 新表：weekly_top5_comments。
 *
 * 逻辑：
 *   - 输入：本周一 rank_date（YYYY-MM-DD），可从命令行传入；
 *           若未传，则自动取 apple_top100 中最新的 rank_date。
 *   - 计算上一周周一：lastMonday = rankDateMonday - 7 天。
 *   - 对于每个平台（iOS / Android）、每个国家、每个 chart_type 的 Top100 榜单：
 *       1) 取本周一 rank_date 的前 5 名（rank 1~5）。
 *       2) 取上周一 rank_date 的对应榜单前 100 名，按 app_id 找出每个前五的上周排名（若无则视为新进）。
 *       3) 生成一句中文描述，示例：
 *          「本周 iOS 美国 免费榜前五中：Block Blast！从第3升至第1；Magic Sort! 新进前五；另外3款游戏排名变化不大。」
 *   - 将描述写入表 weekly_top5_comments，表结构：
 *       id          INTEGER PRIMARY KEY AUTOINCREMENT
 *       rank_date   TEXT    本周一
 *       platform    TEXT    'ios' / 'android'
 *       country     TEXT    国家码（US/JP/...）
 *       chart_type  TEXT    榜单类型（topfreeapplications / topselling_free ...）
 *       summary     TEXT    一句话描述（中文）
 *       detail_json TEXT    可选，前五的详细 JSON（方便后续调试 / 展示）
 *       created_at  TEXT    默认 datetime('now')
 *
 * 用法：
 *   node generate_weekly_top5_comments.js
 *      → 自动取最新 rank_date 作为本周一生成一句话描述
 *
 *   node generate_weekly_top5_comments.js 2026-02-23
 *      → 为 2026-02-23 这一周生成 / 覆盖所有榜单的一句话描述
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const DB_FILE = process.env.SENSORTOWER_DB_FILE
  ? (path.isAbsolute(process.env.SENSORTOWER_DB_FILE)
      ? process.env.SENSORTOWER_DB_FILE
      : path.join(__dirname, '..', process.env.SENSORTOWER_DB_FILE))
  : path.join(__dirname, '..', 'data', 'sensortower_top100.db');

// 国家展示名（可用于描述中）
const COUNTRY_DISPLAY = {
  US: '美国',
  JP: '日本',
  GB: '英国',
  DE: '德国',
  IN: '印度',
};

// 榜单展示名
const CHART_TYPE_DISPLAY_IOS = {
  topfreeapplications: '免费榜',
  topgrossingapplications: '畅销榜',
};

const CHART_TYPE_DISPLAY_ANDROID = {
  topselling_free: '免费榜',
  topgrossing: '畅销榜',
};

function loadOpenRouterKey() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return null;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  let key = null;
  let baseUrl = null;
  let model = null;
  for (const line of content.split('\n')) {
    const m1 = line.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.+)\s*$/);
    const m2 = line.match(/^\s*OPENROUTER_API_TOKEN\s*=\s*(.+)\s*$/);
    const m3 = line.match(/^\s*OPENROUTER_BASE_URL\s*=\s*(.+)\s*$/);
    const m4 = line.match(/^\s*OPENROUTER_MODEL\s*=\s*(.+)\s*$/);
    if (m1) key = m1[1].trim().replace(/^["']|["']$/g, '');
    if (m2 && !key) key = m2[1].trim().replace(/^["']|["']$/g, '');
    if (m3) baseUrl = m3[1].trim().replace(/^["']|["']$/g, '');
    if (m4) model = m4[1].trim().replace(/^["']|["']$/g, '');
  }
  if (!key) return null;
  return {
    apiKey: key,
    baseUrl: baseUrl || 'https://openrouter.ai/api/v1',
    model: model || 'google/gemini-2.0-flash-001',
  };
}

function callOpenRouterForSummary(openRouterCfg, payload) {
  const { apiKey, baseUrl, model } = openRouterCfg;
  const url = new URL('/chat/completions', baseUrl);

  const body = JSON.stringify({
    model: model || 'google/gemini-2.0-flash-001',
    messages: [
      {
        role: 'system',
        content:
          '你是一个熟悉游戏行业的中文数据分析师。根据提供的前五名榜单数据，用**简体中文**生成一条简洁的一句话总结，重点描述本周前五的排名变化（新进、明显上升/下降、整体稳定等）。不要复述所有细节，只给出总括性的观察，长度控制在 40~80 个汉字之间。',
      },
      {
        role: 'user',
        content:
          `请根据下面这份结构化数据，生成一条简洁的一句话总结：\n\n` +
          `平台: ${payload.platformLabel}\n` +
          `国家: ${payload.countryLabel}\n` +
          `榜单: ${payload.chartLabel}\n` +
          `本周一: ${payload.rankDateMonday}\n` +
          `上周一: ${payload.lastMonday}\n` +
          `前五明细(JSON)：\n` +
          `${JSON.stringify(payload.top5Detail, null, 2)}\n\n` +
          `只输出一句总结话，不要加前缀、不要编号，也不要解释你在做什么。`,
      },
    ],
    max_tokens: 120,
    temperature: 0.6,
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(
            new Error(`OpenRouter HTTP ${res.statusCode}: ${data.slice(0, 200)}`)
          );
        }
        try {
          const json = JSON.parse(data);
          const text =
            json.choices &&
            json.choices[0] &&
            json.choices[0].message &&
            json.choices[0].message.content;
          if (!text) {
            return reject(new Error('OpenRouter 返回内容为空'));
          }
          resolve(String(text).trim());
        } catch (e) {
          reject(new Error('OpenRouter 响应解析失败: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function runSqlReturn(sql) {
  const compact = sql
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const safe = compact.replace(/"/g, '""');
  try {
    return execSync(`sqlite3 -separator '|' "${DB_FILE}" "${safe}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (_) {
    return '';
  }
}

function runSql(sql) {
  const compact = sql
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const safe = compact.replace(/"/g, '""');
  execSync(`sqlite3 "${DB_FILE}" "${safe}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function escapeSqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function ensureTable() {
  runSql(`
    CREATE TABLE IF NOT EXISTS weekly_top5_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rank_date TEXT NOT NULL,
      platform TEXT NOT NULL,
      country TEXT NOT NULL,
      chart_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (rank_date, platform, country, chart_type)
    );
  `);
}

function getLatestRankDate() {
  const out = runSqlReturn(`
    SELECT MAX(rank_date) FROM apple_top100;
  `);
  const v = (out || '').trim();
  if (!v) return null;
  return v.split('\n')[0].trim();
}

function getLastMonday(currentYmd) {
  const d = new Date(currentYmd + 'T12:00:00Z');
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 7);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTopN(table, rankDate, country, chartType, limit) {
  const out = runSqlReturn(`
    SELECT rank, app_id,
           COALESCE(NULLIF(trim(app_name), ''), app_id) AS app_name
    FROM ${table}
    WHERE rank_date = '${rankDate.replace(/'/g, "''")}'
      AND country = '${country.replace(/'/g, "''")}'
      AND chart_type = '${chartType.replace(/'/g, "''")}'
    ORDER BY rank ASC
    LIMIT ${limit};
  `);
  const rows = [];
  for (const line of (out || '').trim().split('\n')) {
    if (!line) continue;
    const parts = line.split('|');
    if (parts.length < 3) continue;
    rows.push({
      rank: parseInt(parts[0], 10) || 0,
      app_id: parts[1].trim(),
      app_name: parts[2].trim(),
    });
  }
  return rows;
}

function buildFallbackSummary(platform, country, chartType, top5, lastWeekRanks) {
  const platLabel = platform.toLowerCase() === 'ios' ? 'iOS' : 'Android';
  const countryLabel = COUNTRY_DISPLAY[country] || country;
  const chartLabel =
    platform.toLowerCase() === 'ios'
      ? CHART_TYPE_DISPLAY_IOS[chartType] || chartType
      : CHART_TYPE_DISPLAY_ANDROID[chartType] || chartType;

  if (!top5 || top5.length === 0) {
    return `本周 ${platLabel} ${countryLabel} ${chartLabel} 前五暂无数据。`;
  }

  const pieces = [];
  let newCount = 0;
  let bigMoveCount = 0;

  for (const item of top5) {
    const key = item.app_id;
    const lastRank = lastWeekRanks[key];
    if (lastRank == null || lastRank === 0) {
      newCount++;
      pieces.push(`${item.app_name} 新进前五（本周第${item.rank}名）`);
    } else {
      const delta = lastRank - item.rank; // 正数表示上升
      if (Math.abs(delta) >= 3) {
        bigMoveCount++;
        if (delta > 0) {
          pieces.push(
            `${item.app_name} 从第${lastRank}升至第${item.rank}名（上升${delta}位）`
          );
        } else {
          pieces.push(
            `${item.app_name} 从第${lastRank}跌至第${item.rank}名（下降${Math.abs(
              delta
            )}位）`
          );
        }
      }
    }
  }

  let head = `本周 ${platLabel} ${countryLabel} ${chartLabel} 前五中：`;
  let body = '';

  if (pieces.length > 0) {
    body = pieces.slice(0, 3).join('；');
  }

  if (newCount === 0 && bigMoveCount === 0) {
    body = '前五整体较为稳定，排名变化不大。';
  } else if (pieces.length > 3) {
    body += '；其余前五应用也有小幅变动。';
  }

  return head + body;
}

async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error('数据库不存在:', DB_FILE);
    process.exit(1);
  }

  ensureTable();

  let rankDateMonday = null;
  const dateArg = process.argv[2];
  if (dateArg) {
    const d = dateArg.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      console.error('日期格式须为 YYYY-MM-DD，例如 2026-02-23（作为本周一）');
      process.exit(1);
    }
    rankDateMonday = d;
  } else {
    rankDateMonday = getLatestRankDate();
    if (!rankDateMonday) {
      console.error('apple_top100 中无 rank_date 数据，请先运行 fetch_top100_to_db.js');
      process.exit(1);
    }
  }

  const lastMonday = getLastMonday(rankDateMonday);
  if (!lastMonday) {
    console.error('无法计算上一周周一，请检查日期：', rankDateMonday);
    process.exit(1);
  }

  console.log(
    '生成前五异动描述：本周一 =',
    rankDateMonday,
    '；上周一 =',
    lastMonday
  );

  // 预先拿到所有组合的国家+榜单类型（按 iOS / Android 分开）
  const combos = [];

  function collectCombos(table, platform) {
    const out = runSqlReturn(`
      SELECT DISTINCT country, chart_type
      FROM ${table}
      WHERE rank_date = '${rankDateMonday.replace(/'/g, "''")}';
    `);
    for (const line of (out || '').trim().split('\n')) {
      if (!line) continue;
      const parts = line.split('|');
      if (parts.length < 2) continue;
      combos.push({
        platform,
        country: parts[0].trim(),
        chart_type: parts[1].trim(),
      });
    }
  }

  collectCombos('apple_top100', 'ios');
  collectCombos('android_top100', 'android');

  const openRouterCfg = loadOpenRouterKey();
  if (!openRouterCfg) {
    console.log('未在 .env 中找到 OPENROUTER_API_KEY，将使用本地规则生成一句话摘要。');
  } else {
    console.log('检测到 OPENROUTER_API_KEY，将通过 OpenRouter 调用 Gemini 生成一句话摘要。');
  }

  let inserted = 0;

  for (const { platform, country, chart_type } of combos) {
    const table = platform === 'ios' ? 'apple_top100' : 'android_top100';

    const top5 = getTopN(table, rankDateMonday, country, chart_type, 5);
    if (top5.length === 0) continue;

    const lastTop = getTopN(table, lastMonday, country, chart_type, 100);
    const lastRanks = {};
    for (const row of lastTop) {
      if (!row.app_id) continue;
      lastRanks[row.app_id] = row.rank;
    }

    const platLabel = platform.toLowerCase() === 'ios' ? 'iOS' : 'Android';
    const countryLabel = COUNTRY_DISPLAY[country] || country;
    const chartLabel =
      platform.toLowerCase() === 'ios'
        ? CHART_TYPE_DISPLAY_IOS[chart_type] || chart_type
        : CHART_TYPE_DISPLAY_ANDROID[chart_type] || chart_type;

    const top5Detail = top5.map((item) => ({
      rank: item.rank,
      app_id: item.app_id,
      app_name: item.app_name,
      last_rank: lastRanks[item.app_id] || null,
    }));

    let summary;
    if (openRouterCfg) {
      try {
        summary = await callOpenRouterForSummary(openRouterCfg, {
          platformLabel: platLabel,
          countryLabel,
          chartLabel,
          rankDateMonday,
          lastMonday,
          top5Detail,
        });
      } catch (e) {
        console.error(
          'OpenRouter 调用失败，将回退到本地规则生成摘要：',
          e.message
        );
        summary = buildFallbackSummary(platform, country, chart_type, top5, lastRanks);
      }
    } else {
      summary = buildFallbackSummary(platform, country, chart_type, top5, lastRanks);
    }
    const detail = JSON.stringify(
      {
        rank_date: rankDateMonday,
        platform,
        country,
        chart_type,
        top5: top5Detail,
      },
      null,
      0
    );

    runSql(`
      INSERT OR REPLACE INTO weekly_top5_comments
        (rank_date, platform, country, chart_type, summary, detail_json)
      VALUES
        (${escapeSqlValue(rankDateMonday)},
         ${escapeSqlValue(platform)},
         ${escapeSqlValue(country)},
         ${escapeSqlValue(chart_type)},
         ${escapeSqlValue(summary)},
         ${escapeSqlValue(detail)});
    `);

    inserted++;
  }

  console.log(
    '已生成 weekly_top5_comments 记录条数（本周一 =',
    rankDateMonday + '）：',
    inserted
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

