#!/usr/bin/env node
/**
 * 完整工作流：获取所有品类的最热游戏和榜单异动
 * 
 * 功能：
 * 1. 获取所有品类的免费榜和畅销榜 Top 100（最热游戏）
 * 2. 获取所有品类的榜单异动（新进榜单、排名飙升、排名上升、排名下跌）
 * 
 * 运行：node fetch_all_hot_games_and_changes.js
 * 依赖：需在 .env 中配置 SENSORTOWER_API_TOKEN
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://api.sensortower.com/v1';
const CONFIG = {
  COUNTRIES: ['US'],
  CHART_TYPES_IOS: { 
    topfreeapplications: '免费榜', 
    topgrossingapplications: '畅销榜' 
  },
  CHART_TYPES_ANDROID: { 
    topselling_free: '免费榜', 
    topgrossing: '畅销榜' 
  },
  TOP_N: 100, // 获取Top 100
  RANK_CHANGE_THRESHOLD: 20, // 排名变化阈值
  TOP_N_CHANGES: 50, // 异动分析只关注Top 50
};

// 从 .env 读取 API Token
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
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

// 获取所有品类的最热游戏
async function fetchAllHotGames(authToken) {
  const categories = loadCategories();
  const date = getDateString(1);
  const allRows = [];
  
  console.log('\n========== 开始获取最热游戏 ==========\n');
  
  // iOS 所有品类
  console.log('📱 处理 iOS 平台...');
  for (const [categoryId, categoryName] of Object.entries(categories.ios)) {
    console.log(`  品类: ${categoryName} (${categoryId})`);
    
    for (const [chartType, chartTypeName] of Object.entries(CONFIG.CHART_TYPES_IOS)) {
      console.log(`    榜单: ${chartTypeName}`);
      
      try {
        const ranking = await fetchRanking('ios', categoryId, chartType, 'US', date, authToken);
        const top100 = (ranking || []).slice(0, CONFIG.TOP_N);
        
        if (top100.length > 0) {
          console.log(`      获取到 ${top100.length} 个应用，正在获取应用名称...`);
          const nameMap = await fetchAppNames('ios', top100, categoryId, chartType, authToken);
          
          for (let i = 0; i < top100.length; i++) {
            allRows.push({
              '平台': 'iOS',
              '品类ID': categoryId,
              '品类名称': categoryName,
              '榜单类型': chartTypeName,
              '国家': 'US',
              '排名': i + 1,
              'App ID': top100[i],
              '应用名称': nameMap[top100[i]] || top100[i],
            });
          }
          
          console.log(`      ✓ 完成 ${chartTypeName}`);
        } else {
          console.log(`      ⚠ 未获取到数据`);
        }
        
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`      ✗ 错误: ${err.message}`);
      }
    }
  }
  
  await new Promise((r) => setTimeout(r, 500));
  
  // Android 所有品类
  console.log('\n🤖 处理 Android 平台...');
  for (const [categoryId, categoryName] of Object.entries(categories.android)) {
    console.log(`  品类: ${categoryName} (${categoryId})`);
    
    for (const [chartType, chartTypeName] of Object.entries(CONFIG.CHART_TYPES_ANDROID)) {
      console.log(`    榜单: ${chartTypeName}`);
      
      try {
        const ranking = await fetchRanking('android', categoryId, chartType, 'US', date, authToken);
        const top100 = (ranking || []).slice(0, CONFIG.TOP_N);
        
        if (top100.length > 0) {
          console.log(`      获取到 ${top100.length} 个应用，正在获取应用名称...`);
          const nameMap = await fetchAppNames('android', top100, categoryId, chartType, authToken);
          
          for (let i = 0; i < top100.length; i++) {
            allRows.push({
              '平台': 'Android',
              '品类ID': categoryId,
              '品类名称': categoryName,
              '榜单类型': chartTypeName,
              '国家': 'US',
              '排名': i + 1,
              'App ID': top100[i],
              '应用名称': nameMap[top100[i]] || top100[i],
            });
          }
          
          console.log(`      ✓ 完成 ${chartTypeName}`);
        } else {
          console.log(`      ⚠ 未获取到数据`);
        }
        
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`      ✗ 错误: ${err.message}`);
      }
    }
  }
  
  // 保存到CSV
  const headers = ['平台', '品类ID', '品类名称', '榜单类型', '国家', '排名', 'App ID', '应用名称'];
  const csvPath = path.join(__dirname, 'all_hot_games.csv');
  writeCsv(csvPath, allRows, headers);
  console.log(`\n✅ 最热游戏数据已保存: ${csvPath} (共 ${allRows.length} 条记录)`);
  
  return allRows.length;
}

// 获取所有品类的榜单异动
async function fetchAllRankChanges(authToken) {
  const categories = loadCategories();
  const currentDate = getDateString(1);
  const lastWeekDate = getDateString(8);
  const allChanges = [];
  
  console.log('\n========== 开始获取榜单异动 ==========\n');
  
  // iOS 所有品类
  console.log('📱 处理 iOS 平台...');
  for (const [categoryId, categoryName] of Object.entries(categories.ios)) {
    console.log(`  品类: ${categoryName} (${categoryId})`);
    
    const chartType = 'topfreeapplications';
    console.log(`    榜单: ${CONFIG.CHART_TYPES_IOS[chartType]}`);
    
    try {
      const [currentRanking, lastWeekRanking] = await Promise.all([
        fetchRanking('ios', categoryId, chartType, 'US', currentDate, authToken),
        fetchRanking('ios', categoryId, chartType, 'US', lastWeekDate, authToken),
      ]);
      
      const lastWeekMap = {};
      (lastWeekRanking || []).forEach((appId, idx) => {
        lastWeekMap[appId] = idx + 1;
      });
      
      const changes = [];
      const appIds = [];
      const currentTop = (currentRanking || []).slice(0, CONFIG.TOP_N_CHANGES);
      
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
          if (change >= CONFIG.RANK_CHANGE_THRESHOLD) {
            changeType = '🚀 排名飙升';
            signal = '🔴';
            changeVal = '↑' + change;
          } else if (change >= 10) {
            changeType = '📈 排名上升';
            signal = '🟡';
            changeVal = '↑' + change;
          } else if (change <= -CONFIG.RANK_CHANGE_THRESHOLD) {
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
            '平台': 'iOS',
            '品类ID': categoryId,
            '品类名称': categoryName,
            '本周排名': currentRank,
            '上周排名': lastWeekRank || '-',
            '变化': changeVal,
            '异动类型': changeType,
          });
        }
      }
      
      if (appIds.length > 0) {
        const nameMap = await fetchAppNames('ios', appIds, categoryId, chartType, authToken);
        changes.forEach((row) => {
          row['应用名称'] = nameMap[row['App ID']] || row['App ID'];
        });
        allChanges.push(...changes);
        console.log(`      ✓ 发现 ${changes.length} 条异动`);
      } else {
        console.log(`      ✓ 无异动`);
      }
      
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`      ✗ 错误: ${err.message}`);
    }
  }
  
  await new Promise((r) => setTimeout(r, 500));
  
  // Android 所有品类
  console.log('\n🤖 处理 Android 平台...');
  for (const [categoryId, categoryName] of Object.entries(categories.android)) {
    console.log(`  品类: ${categoryName} (${categoryId})`);
    
    const chartType = 'topselling_free';
    console.log(`    榜单: ${CONFIG.CHART_TYPES_ANDROID[chartType]}`);
    
    try {
      const [currentRanking, lastWeekRanking] = await Promise.all([
        fetchRanking('android', categoryId, chartType, 'US', currentDate, authToken),
        fetchRanking('android', categoryId, chartType, 'US', lastWeekDate, authToken),
      ]);
      
      const lastWeekMap = {};
      (lastWeekRanking || []).forEach((appId, idx) => {
        lastWeekMap[appId] = idx + 1;
      });
      
      const changes = [];
      const appIds = [];
      const currentTop = (currentRanking || []).slice(0, CONFIG.TOP_N_CHANGES);
      
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
          if (change >= CONFIG.RANK_CHANGE_THRESHOLD) {
            changeType = '🚀 排名飙升';
            signal = '🔴';
            changeVal = '↑' + change;
          } else if (change >= 10) {
            changeType = '📈 排名上升';
            signal = '🟡';
            changeVal = '↑' + change;
          } else if (change <= -CONFIG.RANK_CHANGE_THRESHOLD) {
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
            '平台': 'Android',
            '品类ID': categoryId,
            '品类名称': categoryName,
            '本周排名': currentRank,
            '上周排名': lastWeekRank || '-',
            '变化': changeVal,
            '异动类型': changeType,
          });
        }
      }
      
      if (appIds.length > 0) {
        const nameMap = await fetchAppNames('android', appIds, categoryId, chartType, authToken);
        changes.forEach((row) => {
          row['应用名称'] = nameMap[row['App ID']] || row['App ID'];
        });
        allChanges.push(...changes);
        console.log(`      ✓ 发现 ${changes.length} 条异动`);
      } else {
        console.log(`      ✓ 无异动`);
      }
      
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`      ✗ 错误: ${err.message}`);
    }
  }
  
  // 保存到CSV
  const headers = ['信号', '应用名称', 'App ID', '国家', '平台', '品类ID', '品类名称', '本周排名', '上周排名', '变化', '异动类型'];
  const csvPath = path.join(__dirname, 'all_rank_changes.csv');
  writeCsv(csvPath, allChanges, headers);
  console.log(`\n✅ 榜单异动数据已保存: ${csvPath} (共 ${allChanges.length} 条异动)`);
  
  return allChanges.length;
}

async function main() {
  console.log('🚀 开始执行完整工作流...\n');
  console.log(`日期: ${getDateString(1)} (本周) vs ${getDateString(8)} (上周)\n`);
  
  const authToken = loadEnv();
  
  try {
    // 1. 获取所有最热游戏
    const hotGamesCount = await fetchAllHotGames(authToken);
    
    // 2. 获取所有榜单异动
    const changesCount = await fetchAllRankChanges(authToken);
    
    console.log('\n========== 工作流完成 ==========');
    console.log(`✅ 最热游戏: ${hotGamesCount} 条记录`);
    console.log(`✅ 榜单异动: ${changesCount} 条记录`);
    console.log('\n生成的文件:');
    console.log('  - all_hot_games.csv (所有品类的最热游戏)');
    console.log('  - all_rank_changes.csv (所有品类的榜单异动)');
  } catch (err) {
    console.error('\n❌ 工作流执行失败:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
