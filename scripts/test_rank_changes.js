#!/usr/bin/env node
/**
 * 获取「Puzzle 之外」某一品类的美国 iOS/Android 榜单异动，写入两个 CSV。
 * 异动：新进 Top50、排名飙升(≥20)、排名上升(≥10)、排名下跌(≤-20)。
 *
 * 运行：node test_rank_changes.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://api.sensortower.com/v1';
const RANK_CHANGE_THRESHOLD = 20;
const TOP_N = 50;

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('请创建 .env 并配置 SENSORTOWER_API_TOKEN');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*SENSORTOWER_API_TOKEN\s*=\s*(.+)\s*$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  console.error('.env 中未找到 SENSORTOWER_API_TOKEN');
  process.exit(1);
}

function loadCategories() {
  const p = path.join(__dirname, 'category.json');
  if (!fs.existsSync(p)) {
    console.error('未找到 category.json');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function pickNonPuzzleCategory(platform, categories) {
  const map = platform === 'ios' ? categories.ios : categories.android;
  const puzzleId = platform === 'ios' ? '7012' : 'game_puzzle';
  const ids = Object.keys(map).filter((id) => id !== puzzleId);
  if (ids.length === 0) throw new Error(`No non-Puzzle category for ${platform}`);
  return { id: ids[0], name: map[ids[0]] };
}

function getDateString(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      })
      .on('error', reject);
  });
}

async function fetchRanking(platform, categoryId, chartType, country, date, authToken) {
  const endpoint = `/${platform}/ranking`;
  const params = {
    category: categoryId,
    chart_type: chartType,
    country,
    date,
    auth_token: authToken,
  };
  const url = `${BASE_URL}${endpoint}?${buildQuery(params)}`;
  const data = await fetch(url);
  return data.ranking || [];
}

async function fetchAppNames(platform, appIds, categoryId, chartType, authToken) {
  const nameMap = {};
  for (let i = 0; i < appIds.length; i += 30) {
    const batch = appIds.slice(i, i + 30);
    const endpoint = `/${platform}/category/category_history`;
    const params = {
      app_ids: batch.join(','),
      category: categoryId,
      chart_type_ids: chartType,
      countries: 'US',
      auth_token: authToken,
    };
    const url = `${BASE_URL}${endpoint}?${buildQuery(params)}`;
    const data = await fetch(url);
    if (data && typeof data === 'object') {
      for (const appId of Object.keys(data)) {
        if (appId === 'lines') continue;
        const appData = data[appId];
        if (appData && appData.US && appData.US[categoryId] && appData.US[categoryId][chartType]) {
          const t = appData.US[categoryId][chartType];
          nameMap[appId] = t.name || t.humanized_app_name || appId;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return nameMap;
}

function escapeCsvCell(s) {
  const str = String(s ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function writeCsv(filePath, rows, headers) {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
  }
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\n'), 'utf8');
}

async function getRankChangesForPlatform(platform, authToken) {
  const categories = loadCategories();
  const cat = pickNonPuzzleCategory(platform, categories);
  const chartType = platform === 'ios' ? 'topfreeapplications' : 'topselling_free';

  const currentDate = getDateString(1);
  const lastWeekDate = getDateString(8);

  const [currentRanking, lastWeekRanking] = await Promise.all([
    fetchRanking(platform, cat.id, chartType, 'US', currentDate, authToken),
    fetchRanking(platform, cat.id, chartType, 'US', lastWeekDate, authToken),
  ]);

  const lastWeekMap = {};
  (lastWeekRanking || []).forEach((appId, idx) => {
    lastWeekMap[appId] = idx + 1;
  });

  const changes = [];
  const appIds = [];
  const currentTop = (currentRanking || []).slice(0, TOP_N);

  for (let k = 0; k < currentTop.length; k++) {
    const appId = currentTop[k];
    const currentRank = k + 1;
    const lastWeekRank = lastWeekMap[appId];

    let changeType = '';
    let signal = '';
    let changeVal = '';

    if (!lastWeekRank) {
      changeType = '🆕 新进榜单';
      signal = '🔴';
      changeVal = 'NEW';
    } else {
      const change = lastWeekRank - currentRank;
      if (change >= RANK_CHANGE_THRESHOLD) {
        changeType = '🚀 排名飙升';
        signal = '🔴';
        changeVal = '↑' + change;
      } else if (change >= 10) {
        changeType = '📈 排名上升';
        signal = '🟡';
        changeVal = '↑' + change;
      } else if (change <= -RANK_CHANGE_THRESHOLD) {
        changeType = '📉 排名下跌';
        signal = '🟢';
        changeVal = '↓' + Math.abs(change);
      }
    }

    if (changeType) {
      appIds.push(appId);
      changes.push({
        '信号': signal,
        '应用名称': '',
        'App ID': appId,
        '国家': 'US',
        '平台': platform === 'ios' ? 'iOS' : 'Android',
        '本周排名': currentRank,
        '上周排名': lastWeekRank || '-',
        '变化': changeVal,
        '异动类型': changeType,
      });
    }
  }

  if (appIds.length > 0) {
    const nameMap = await fetchAppNames(platform, appIds, cat.id, chartType, authToken);
    changes.forEach((row) => {
      row['应用名称'] = nameMap[row['App ID']] || row['App ID'];
    });
  }

  return { rows: changes, categoryName: cat.name, categoryId: cat.id };
}

async function main() {
  const authToken = loadEnv();

  console.log('获取 iOS 美国榜单异动（非 Puzzle 品类）...');
  const iosResult = await getRankChangesForPlatform('ios', authToken);
  const iosPath = path.join(__dirname, 'test_rank_changes_ios.csv');
  const headers = ['信号', '应用名称', 'App ID', '国家', '平台', '本周排名', '上周排名', '变化', '异动类型'];
  writeCsv(iosPath, iosResult.rows, headers);
  console.log('iOS 品类:', iosResult.categoryId, iosResult.categoryName);
  console.log('已写入:', iosPath, '(' + iosResult.rows.length + ' 条异动)');

  await new Promise((r) => setTimeout(r, 300));

  console.log('\n获取 Android 美国榜单异动（非 Puzzle 品类）...');
  const androidResult = await getRankChangesForPlatform('android', authToken);
  const androidPath = path.join(__dirname, 'test_rank_changes_android.csv');
  writeCsv(androidPath, androidResult.rows, headers);
  console.log('Android 品类:', androidResult.categoryId, androidResult.categoryName);
  console.log('已写入:', androidPath, '(' + androidResult.rows.length + ' 条异动)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
