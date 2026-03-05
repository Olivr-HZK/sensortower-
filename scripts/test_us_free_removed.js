#!/usr/bin/env node
/**
 * 测试脚本：检测「美国 Top100 免费榜」历史所有周的数据中是否有下架，不写数据库，结果输出到 JSON。
 *
 * 范围：库中所有有记录的 rank_date（周一）的 iOS US topfreeapplications + Android US topselling_free，各最多 100 条。
 * 判定：与 detect_removed_games.js 一致，多次请求均失败才记为疑似下架。
 *
 * 用法（项目根目录）：
 *   node scripts/test_us_free_removed.js
 *
 * 输出：output/test_us_free_removed.json
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

const OUT_FILE = path.join(__dirname, '..', 'output', 'test_us_free_removed.json');

const REMOVED_CHECK_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

/** 获取库中所有存在 US 免费榜记录的 rank_date（升序） */
function getAllUsRankDates() {
  console.log('[DEBUG] 查询所有 US 免费榜 rank_date');
  const out = runSqlReturn(`
    SELECT DISTINCT rank_date FROM (
      SELECT rank_date FROM apple_top100
        WHERE country = 'US' AND chart_type = 'topfreeapplications'
      UNION
      SELECT rank_date FROM android_top100
        WHERE country = 'US' AND chart_type = 'topselling_free'
    )
    ORDER BY rank_date ASC;
  `);
  console.log('[DEBUG] 原始 SQL 输出 =', JSON.stringify(out, null, 2));
  const dates = (out || '')
    .trim()
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  console.log('[DEBUG] 解析后的 dates =', dates);
  return dates;
}

/** 仅加载美国免费榜：iOS US topfreeapplications + Android US topselling_free */
function loadUsFreeTargets(rankDate) {
  const safeDate = rankDate.replace(/'/g, "''");
  const targets = [];

  console.log('[DEBUG] 加载美国免费榜，rank_date =', rankDate);

  const iosOut = runSqlReturn(`
    SELECT country, chart_type, rank, app_id,
           COALESCE(NULLIF(TRIM(app_name), ''), app_id) AS app_name
    FROM apple_top100
    WHERE rank_date = '${safeDate}' AND country = 'US' AND chart_type = 'topfreeapplications'
    ORDER BY rank ASC;
  `);
  console.log('[DEBUG] iOS 查询原始结果长度 =', (iosOut || '').split('\n').length);
  for (const line of (iosOut || '').trim().split('\n')) {
    if (!line) continue;
    const p = line.split('|');
    if (p.length < 5) continue;
    targets.push({
      os: 'ios',
      country: p[0].trim(),
      chart_type: p[1].trim(),
      rank: parseInt(p[2], 10) || 0,
      app_id: p[3].trim(),
      app_name: p[4].trim(),
    });
  }

  console.log(
    '[DEBUG] iOS US topfreeapplications 条数 =',
    targets.filter((t) => t.os === 'ios').length
  );

  const andOut = runSqlReturn(`
    SELECT country, chart_type, rank, app_id,
           COALESCE(NULLIF(TRIM(app_name), ''), app_id) AS app_name
    FROM android_top100
    WHERE rank_date = '${safeDate}' AND country = 'US' AND chart_type = 'topselling_free'
    ORDER BY rank ASC;
  `);
  console.log('[DEBUG] Android 查询原始结果长度 =', (andOut || '').split('\n').length);
  for (const line of (andOut || '').trim().split('\n')) {
    if (!line) continue;
    const p = line.split('|');
    if (p.length < 5) continue;
    targets.push({
      os: 'android',
      country: p[0].trim(),
      chart_type: p[1].trim(),
      rank: parseInt(p[2], 10) || 0,
      app_id: p[3].trim(),
      app_name: p[4].trim(),
    });
  }

  console.log(
    '[DEBUG] Android US topselling_free 条数 =',
    targets.filter((t) => t.os === 'android').length
  );
  console.log('[DEBUG] 本周合计 targets.length =', targets.length);

  return targets;
}

function buildStoreUrl(target) {
  const country = (target.country || 'US').toLowerCase();
  if (target.os === 'ios') {
    return `https://apps.apple.com/${country}/app/id${encodeURIComponent(target.app_id)}`;
  }
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(target.app_id)}`;
}

function checkUrl(url) {
  return new Promise((resolve) => {
    let resolved = false;
    try {
      const req = https.request(
        url,
        { method: 'GET', timeout: 15000 },
        (res) => {
          resolved = true;
          res.resume();
          resolve({ status: res.statusCode || 0, error: null });
        }
      );
      req.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          req.destroy();
          resolve({ status: 0, error: 'timeout' });
        }
      });
      req.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          resolve({ status: 0, error: String(err && err.message ? err.message : err) });
        }
      });
      req.end();
    } catch (e) {
      if (!resolved) resolve({ status: 0, error: String(e && e.message ? e.message : e) });
    }
  });
}

async function main() {
  const dates = getAllUsRankDates();
  if (!dates.length) {
    console.error('库中没有美国免费榜的 rank_date 记录');
    process.exit(1);
  }

  console.log('将依次检测以下周一的美国免费榜：', dates.join(', '));

  const summaries = [];

  for (const rankDate of dates) {
    console.log('\\n[DEBUG] 开始处理 rank_date =', rankDate);
    const targets = loadUsFreeTargets(rankDate);
    if (!targets.length) {
      console.log('[DEBUG] 本周 targets 为空，跳过 HTTP 检测');
      summaries.push({
        rank_date: rankDate,
        scope: 'US free (iOS topfreeapplications + Android topselling_free)',
        total_checked: 0,
        removed_count: 0,
        removed: [],
        message: 'no data for this week',
      });
      continue;
    }

    console.log('\\n=== 检测周一', rankDate, '美国免费榜，共', targets.length, '条 ===');
    const removed = [];

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const url = buildStoreUrl(t);
      let status = 0;
      let reason = '';
      let isRemoved = false;

      for (let attempt = 1; attempt <= REMOVED_CHECK_RETRIES; attempt++) {
        try {
          const result = await checkUrl(url);
          status = result.status || 0;
          if (status >= 200 && status < 400) {
            isRemoved = false;
            break;
          }
          if (status >= 400 && status < 600) {
            reason = `HTTP ${status}`;
            isRemoved = true;
          } else if (status === 0 && result.error) {
            reason = result.error;
            isRemoved = true;
          }
        } catch (e) {
          reason = String(e && e.message ? e.message : e);
          isRemoved = true;
        }
        if (isRemoved && attempt < REMOVED_CHECK_RETRIES) {
          await sleep(RETRY_DELAY_MS);
        }
      }

      if (isRemoved) {
        removed.push({
          os: t.os,
          rank: t.rank,
          app_id: t.app_id,
          app_name: t.app_name,
          store_url: url,
          http_status: status || null,
          reason,
        });
        console.log(
          '[DEBUG] 疑似下架:',
          rankDate,
          t.os,
          t.rank,
          t.app_name || t.app_id,
          'status=',
          status,
          'reason=',
          reason
        );
      }

      if ((i + 1) % 50 === 0) {
        console.log('[DEBUG] 已检测', i + 1, '/', targets.length);
      }
    }

    console.log(
      '[DEBUG] 本周检测完成，total_checked =',
      targets.length,
      'removed_count =',
      removed.length
    );

    summaries.push({
      rank_date: rankDate,
      scope: 'US free (iOS topfreeapplications + Android topselling_free)',
      total_checked: targets.length,
      removed_count: removed.length,
      removed,
    });
  }

  const out = {
    checked_at: new Date().toISOString(),
    weeks: summaries,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log('\\n全部检测完成，周数:', summaries.length, '已写入', OUT_FILE);
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
