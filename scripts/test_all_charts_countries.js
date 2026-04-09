#!/usr/bin/env node
/**
 * 测试所有榜单 + 所有地区，返回有多少个游戏有数据
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const APPID_US_JSON = path.join(__dirname, '..', 'data', 'appid_us.json');
const AUTH_TOKEN = process.env.SENSORTOWER_API_TOKEN;

const CHARTS = [
  { os: 'ios',    category: '7003',      chartType: 'topfreeapplications',    name: 'iOS Casual Free' },
  { os: 'ios',    category: '7003',      chartType: 'topgrossingapplications', name: 'iOS Casual Grossing' },
  { os: 'ios',    category: '7012',      chartType: 'topfreeapplications',    name: 'iOS Puzzle Free' },
  { os: 'ios',    category: '7012',      chartType: 'topgrossingapplications', name: 'iOS Puzzle Grossing' },
  { os: 'android',category: 'game_casual', chartType: 'topselling_free',       name: 'Android Casual Free' },
  { os: 'android',category: 'game_casual', chartType: 'topgrossing',           name: 'Android Casual Grossing' },
  { os: 'android',category: 'game_puzzle',  chartType: 'topselling_free',       name: 'Android Puzzle Free' },
  { os: 'android',category: 'game_puzzle',  chartType: 'topgrossing',           name: 'Android Puzzle Grossing' },
];

const COUNTRIES = ['US', 'JP', 'GB', 'DE', 'IN'];
const TARGET_DATE = '2026-03-22';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testChart(chart, appIds, country) {
  const batchSize = 10;
  let total = 0;
  for (let i = 0; i < appIds.length; i += batchSize) {
    const batch = appIds.slice(i, i + batchSize);
    const params = new URLSearchParams({
      app_ids: batch.join(','),
      category: chart.category,
      chart_type_ids: chart.chartType,
      countries: country,
      start_date: TARGET_DATE,
      end_date: TARGET_DATE,
    });
    try {
      const data = await httpsGet(`https://api.sensortower-china.com/v1/${chart.os}/category/category_history?${params}`);
      const count = countAppsWithData(data);
      total += count;
    } catch (e) {
      // ignore
    }
    await sleep(300);
  }
  return total;
}

function countAppsWithData(data) {
  if (!data || typeof data !== 'object') return 0;
  let count = 0;
  for (const [appId, countriesData] of Object.entries(data)) {
    if (appId === 'lines') continue;
    for (const [country, catsData] of Object.entries(countriesData)) {
      for (const [catId, chartsData] of Object.entries(catsData)) {
        for (const [chartType, chartData] of Object.entries(chartsData)) {
          if (chartData.graphData && chartData.graphData.some(([t, r]) => r !== null)) {
            count++;
            break;
          }
        }
      }
    }
  }
  return count;
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(APPID_US_JSON, 'utf-8'));
  const iosAppIds = raw.filter(a => a.apple_app_id).map(a => a.apple_app_id);
  const androidAppIds = raw.filter(a => a.google_app_id).map(a => a.google_app_id);

  console.log(`iOS app count: ${iosAppIds.length}, Android app count: ${androidAppIds.length}\n`);

  const results = [];

  for (const chart of CHARTS) {
    const appIds = chart.os === 'ios' ? iosAppIds : androidAppIds;
    for (const country of COUNTRIES) {
      process.stdout.write(`${chart.name} | ${country} ... `);
      const count = await testChart(chart, appIds, country);
      console.log(`${count} 个游戏有数据`);
      results.push({ chart: chart.name, country, count });
      await sleep(500);
    }
    console.log('');
  }

  console.log('\n=== 汇总 ===');
  for (const r of results) {
    console.log(`${r.chart.padEnd(30)} ${r.country}  →  ${r.count} 个游戏`);
  }
}

main().catch(console.error);
