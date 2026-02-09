#!/usr/bin/env node
/**
 * 从 ai_product.json 中随便选一个 AI 产品（app_id），
 * 调用 /v1/unified/sales_report_estimates 接口，
 * 获取上周一到上周日（按周聚合，weekly）的下载与收入数据，并写入 ai_sales_estimates.csv。
 *
 * 运行：node ai_sales_estimates.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 中国区 API 域名（与官网 curl 一致）
const BASE_URL = 'https://api.sensortower-china.com/v1';

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
      return m[1].trim().replace(/^[\"']|[\"']$/g, '');
    }
  }
  console.error('.env 中未找到 SENSORTOWER_API_TOKEN');
  process.exit(1);
}

// 从 ai_product.json 中随便选一个 app_id
function pickOneAppId() {
  const p = path.join(__dirname, 'ai_product.json');
  if (!fs.existsSync(p)) {
    console.error('未找到 ai_product.json');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const groups = Object.values(json);
  for (const group of groups) {
    if (group && typeof group === 'object') {
      const ids = Object.values(group);
      if (ids.length > 0) {
        return ids[0]; // 取第一个即可
      }
    }
  }
  console.error('ai_product.json 中未找到任何 app_id');
  process.exit(1);
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 计算「上周一 ~ 上周日」的日期范围
function getLastWeekRange() {
  const today = new Date();
  const day = today.getDay(); // 0=周日,1=周一,...,6=周六

  // 本周一
  const currentMonday = new Date(today);
  const diffToMonday = (day + 6) % 7; // 距离周一的天数
  currentMonday.setDate(currentMonday.getDate() - diffToMonday);

  // 上周一 = 本周一 - 7 天
  const lastMonday = new Date(currentMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);

  // 上周日 = 上周一 + 6 天
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastSunday.getDate() + 6);

  return {
    start: formatDate(lastMonday),
    end: formatDate(lastSunday),
  };
}

function buildQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function fetchJson(url) {
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
          } catch (e) {
            reject(new Error('JSON 解析失败: ' + e.message));
          }
        });
      })
      .on('error', reject);
  });
}

function escapeCsvCell(s) {
  const str = String(s ?? '');
  if (/[\",\\n\\r]/.test(str)) return `\"${str.replace(/\"/g, '\"\"')}\"`;
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
  const appId = pickOneAppId();
  const { start, end } = getLastWeekRange();

  console.log('选中的 AI 产品 app_id:', appId);
  console.log('查询区间（上周一 ~ 上周日）：', start, '->', end);

  const params = {
    app_ids: appId,
    date_granularity: 'weekly',
    start_date: start,
    end_date: end,
    data_model: 'DM_2025_Q2',
    auth_token: authToken,
  };

  // ai_product.json 里是 Android 包名，用 android 端点
  const url = `${BASE_URL}/android/sales_report_estimates?${buildQuery(params)}`;
  console.log('请求 URL:', url.replace(authToken, '***'));

  const data = await fetchJson(url);

  // 响应可能是：直接数组、或 sales_report_estimates_key.unified、或根上的数组
  let unified = null;
  if (Array.isArray(data)) {
    unified = data;
  } else if (data && data.sales_report_estimates_key) {
    const inner = data.sales_report_estimates_key;
    unified = Array.isArray(inner) ? inner : (inner && inner.unified ? inner.unified : null);
  } else if (data && data.unified) {
    unified = data.unified;
  } else if (data && data.lines) {
    unified = data.lines;
  }

  if (!unified) {
    console.error(
      '响应中未找到 sales_report_estimates_key.unified 或数组，原始响应片段:',
      JSON.stringify(data).slice(0, 500)
    );
    const emptyOut = path.join(__dirname, 'ai_sales_estimates.csv');
    writeCsv(emptyOut, [], [
      'app_id',
      'country',
      'date',
      'android_units',
      'android_revenue',
      'ipad_units',
      'ipad_revenue',
      'iphone_units',
      'iphone_revenue',
    ]);
    console.log('无数据，已写入空 CSV（仅表头）:', emptyOut);
    process.exit(0);
  }

  if (!Array.isArray(unified)) {
    unified = [unified];
  }

  const headers = [
    'app_id',
    'country',
    'date',
    'android_units',
    'android_revenue',
    'ipad_units',
    'ipad_revenue',
    'iphone_units',
    'iphone_revenue',
  ];

  const rows = unified.map((item) => {
    // 实际返回格式：aid, c(国家), d(日期), u(下载), r(收入，可能无)
    const appIdVal = item.app_id || item.aid || appId;
    const countryVal = item.country || item.c || item.cc || '';
    const dateVal = item.date || item.d || '';
    const androidUnits = item.android_units ?? item.u ?? '';
    const androidRevenue = item.android_revenue ?? item.r ?? '';
    return {
      app_id: appIdVal,
      country: countryVal,
      date: dateVal,
      android_units: androidUnits,
      android_revenue: androidRevenue,
      ipad_units: item.ipad_units ?? '',
      ipad_revenue: item.ipad_revenue ?? '',
      iphone_units: item.iphone_units ?? '',
      iphone_revenue: item.iphone_revenue ?? '',
    };
  });

  const outPath = path.join(__dirname, 'ai_sales_estimates.csv');
  writeCsv(outPath, rows, headers);

  console.log('已写入 CSV:', outPath, `(${rows.length} 行)`);
}

main().catch((err) => {
  console.error('执行失败:', err.message);
  process.exit(1);
});

