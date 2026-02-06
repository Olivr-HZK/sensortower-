#!/usr/bin/env node
/**
 * AI 产品销量爬虫：根据 ai_product.json 中的产品名与 app_id 逐个请求
 * /v1/android/sales_report_estimates，获取上周一至上周日按周聚合数据，写入单个 CSV。
 *
 * 运行：node ai_sales_crawler.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://api.sensortower-china.com/v1';
const DELAY_MS = 400;

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

/**
 * 从 ai_product.json 解析出所有产品：{ category, productName, appId }[]
 */
function loadProducts() {
  const p = path.join(__dirname, 'ai_product.json');
  if (!fs.existsSync(p)) {
    console.error('未找到 ai_product.json');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const list = [];
  for (const [category, group] of Object.entries(json)) {
    if (group && typeof group === 'object') {
      for (const [productName, appId] of Object.entries(group)) {
        list.push({ category, productName, appId: String(appId) });
      }
    }
  }
  if (list.length === 0) {
    console.error('ai_product.json 中未找到任何产品');
    process.exit(1);
  }
  return list;
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLastWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const currentMonday = new Date(today);
  currentMonday.setDate(currentMonday.getDate() - (day + 6) % 7);
  const lastMonday = new Date(currentMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastSunday.getDate() + 6);
  return { start: formatDate(lastMonday), end: formatDate(lastSunday) };
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function parseResponse(data, appId) {
  let list = null;
  if (Array.isArray(data)) {
    list = data;
  } else if (data && data.sales_report_estimates_key) {
    const inner = data.sales_report_estimates_key;
    list = Array.isArray(inner) ? inner : (inner && inner.unified ? inner.unified : null);
  } else if (data && data.unified) {
    list = data.unified;
  } else if (data && data.lines) {
    list = data.lines;
  }
  if (!list || !Array.isArray(list)) return [];
  return list.map((item) => ({
    app_id: item.app_id || item.aid || appId,
    country: item.country || item.c || item.cc || '',
    date: item.date || item.d || '',
    android_units: item.android_units ?? item.u ?? '',
    android_revenue: item.android_revenue ?? item.r ?? '',
  }));
}

async function main() {
  const authToken = loadEnv();
  const products = loadProducts();
  const { start, end } = getLastWeekRange();

  console.log('产品数:', products.length);
  console.log('查询区间（上周一 ~ 上周日）:', start, '->', end);

  const headers = [
    'product_name',
    'category',
    'app_id',
    'country',
    'date',
    'android_units',
    'android_revenue',
  ];
  const allRows = [];

  for (let i = 0; i < products.length; i++) {
    const { category, productName, appId } = products[i];
    console.log(`[${i + 1}/${products.length}] ${productName} (${appId})`);

    const params = {
      app_ids: appId,
      date_granularity: 'weekly',
      start_date: start,
      end_date: end,
      data_model: 'DM_2025_Q2',
      auth_token: authToken,
    };
    const url = `${BASE_URL}/android/sales_report_estimates?${buildQuery(params)}`;

    try {
      const data = await fetchJson(url);
      const rows = parseResponse(data, appId);
      for (const r of rows) {
        allRows.push({
          product_name: productName,
          category,
          app_id: r.app_id,
          country: r.country,
          date: r.date,
          android_units: r.android_units,
          android_revenue: r.android_revenue,
        });
      }
      if (rows.length === 0) {
        console.log('  -> 无数据');
      } else {
        console.log('  ->', rows.length, '条');
      }
    } catch (err) {
      console.error('  -> 请求失败:', err.message);
    }

    if (i < products.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const outPath = path.join(__dirname, 'ai_sales_crawler.csv');
  writeCsv(outPath, allRows, headers);
  console.log('\n已写入:', outPath, '总行数:', allRows.length);
}

main().catch((err) => {
  console.error('执行失败:', err.message);
  process.exit(1);
});
