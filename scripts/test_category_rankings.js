#!/usr/bin/env node
/**
 * 测试脚本：从 category.json 中选择 Puzzle 之外的品类，
 * 在 iOS 和 Android 各选一个，获取美国排行榜及应用信息，写入本地 CSV。
 *
 * 运行：node test_category_rankings.js
 * 依赖：需在 .env 中配置 SENSORTOWER_API_TOKEN
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://api.sensortower.com/v1';
const CONFIG = {
  COUNTRIES: ['US'],
  CHART_TYPES_IOS: { topfreeapplications: '免费榜', topgrossingapplications: '畅销榜' },
  CHART_TYPES_ANDROID: { topselling_free: '免费榜', topgrossing: '畅销榜' },
};

// 从 .env 读取 API Token
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('请创建 .env 文件并配置 SENSORTOWER_API_TOKEN');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*SENSORTOWER_API_TOKEN\s*=\s*(.+)\s*$/);
    if (m) {
      return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  console.error('.env 中未找到 SENSORTOWER_API_TOKEN');
  process.exit(1);
}

// 加载 category.json
function loadCategories() {
  const p = path.join(__dirname, 'category.json');
  if (!fs.existsSync(p)) {
    console.error('未找到 category.json');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// 选一个 Puzzle 之外的品类
function pickNonPuzzleCategory(platform, categories) {
  const map = platform === 'ios' ? categories.ios : categories.android;
  const puzzleId = platform === 'ios' ? '7012' : 'game_puzzle';
  const ids = Object.keys(map).filter((id) => id !== puzzleId);
  if (ids.length === 0) {
    throw new Error(`No non-Puzzle category for ${platform}`);
  }
  const id = ids[0];
  return { id, name: map[id] };
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

// 获取排行榜
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

// 批量获取应用名称（每批 30 个）
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
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(filePath, rows, headers) {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
  }
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\n'), 'utf8');
}

async function main() {
  const authToken = loadEnv();
  const categories = loadCategories();

  const iosCategory = pickNonPuzzleCategory('ios', categories);
  const androidCategory = pickNonPuzzleCategory('android', categories);

  console.log('iOS 品类:', iosCategory.id, iosCategory.name);
  console.log('Android 品类:', androidCategory.id, androidCategory.name);

  const date = getDateString(1);
  const headers = ['平台', '品类ID', '品类名称', '榜单类型', '国家', '排名', 'App ID', '应用名称'];

  // iOS：只取免费榜 Top 100，美国
  const iosChartType = 'topfreeapplications';
  console.log('\n获取 iOS 排行榜...');
  const iosRanking = await fetchRanking('ios', iosCategory.id, iosChartType, 'US', date, authToken);
  const iosTop100 = (iosRanking || []).slice(0, 100);
  console.log('获取 iOS 应用名称...');
  const iosNameMap = await fetchAppNames('ios', iosTop100, iosCategory.id, 'topfreeapplications', authToken);

  const iosRows = [];
  for (let i = 0; i < iosTop100.length; i++) {
    iosRows.push({
      '平台': 'iOS',
      '品类ID': iosCategory.id,
      '品类名称': iosCategory.name,
      '榜单类型': CONFIG.CHART_TYPES_IOS[iosChartType] || iosChartType,
      '国家': 'US',
      '排名': i + 1,
      'App ID': iosTop100[i],
      '应用名称': iosNameMap[iosTop100[i]] || iosTop100[i],
    });
  }

  const iosCsvPath = path.join(__dirname, 'test_rankings_us_ios.csv');
  writeCsv(iosCsvPath, iosRows, headers);
  console.log('已写入:', iosCsvPath, '(' + iosRows.length + ' 行)');

  await new Promise((r) => setTimeout(r, 300));

  // Android：只取免费榜 Top 100，美国
  const androidChartType = 'topselling_free';
  console.log('\n获取 Android 排行榜...');
  const androidRanking = await fetchRanking(
    'android',
    androidCategory.id,
    androidChartType,
    'US',
    date,
    authToken
  );
  const androidTop100 = (androidRanking || []).slice(0, 100);
  console.log('获取 Android 应用名称...');
  const androidNameMap = await fetchAppNames(
    'android',
    androidTop100,
    androidCategory.id,
    'topselling_free',
    authToken
  );

  const androidRows = [];
  for (let i = 0; i < androidTop100.length; i++) {
    androidRows.push({
      '平台': 'Android',
      '品类ID': androidCategory.id,
      '品类名称': androidCategory.name,
      '榜单类型': CONFIG.CHART_TYPES_ANDROID[androidChartType] || androidChartType,
      '国家': 'US',
      '排名': i + 1,
      'App ID': androidTop100[i],
      '应用名称': androidNameMap[androidTop100[i]] || androidTop100[i],
    });
  }

  const androidCsvPath = path.join(__dirname, 'test_rankings_us_android.csv');
  writeCsv(androidCsvPath, androidRows, headers);
  console.log('已写入:', androidCsvPath, '(' + androidRows.length + ' 行)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
