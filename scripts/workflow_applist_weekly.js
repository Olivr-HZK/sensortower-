#!/usr/bin/env node
/**
 * App 列表周报工作流：不依赖 Top100，从 data/appid_list.json 读取 app 列表，
 * 拉取这些 app 的 metadata 以及「上周」「上上周」的 revenue/download，写入数据库。
 *
 * 步骤：
 *   1. fetch_applist_metadata_to_db.js  → 从 appid_list.json 拉取 metadata 写入 app_metadata
 *   2. fetch_applist_sales_to_db.js     → 拉取上周、上上周的 downloads/revenue 写入 app_list_weekly_sales
 *
 * 用法：
 *   node workflow_applist_weekly.js
 *     → 使用「本周一」为今天所在周的周一
 *   node workflow_applist_weekly.js 2026-02-24
 *     → 指定「本周一」为 2026-02-24
 *   node workflow_applist_weekly.js /path/to/appid_list.json 2026-02-24
 *
 * 每周一执行（cron 示例）：
 *   35 10 * * 1 cd /path/to/sensortower && node scripts/workflow_applist_weekly.js >> logs/applist_weekly.log 2>&1
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// 优先用环境变量，否则用 App 列表专用库（与 Top100 库分离）
const DEFAULT_APPLIST_DB = path.join(ROOT, 'data', 'sensortower_applist.db');
const DEFAULT_APPLIST = path.join(ROOT, 'data', 'appid_list.json');

function getDbFile() {
  const fromEnv = process.env.SENSORTOWER_DB_FILE;
  if (fromEnv && fromEnv.trim()) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(ROOT, fromEnv);
  }
  return DEFAULT_APPLIST_DB;
}

function run(name, cmd, envExtra = {}) {
  console.log('\n' + '='.repeat(60));
  console.log('[工作流]', name);
  console.log('='.repeat(60));
  const env = Object.assign({}, process.env, { SENSORTOWER_DB_FILE: getDbFile() }, envExtra);
  execSync(cmd, {
    cwd: path.join(ROOT, 'scripts'),
    stdio: 'inherit',
    shell: true,
    env,
  });
}

function main() {
  const listPath = process.argv[2] && !/^\d{4}-\d{2}-\d{2}$/.test(process.argv[2].trim())
    ? process.argv[2].trim()
    : DEFAULT_APPLIST;
  const mondayArg = process.argv[3] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[3].trim())
    ? process.argv[3].trim()
    : (process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2].trim()) ? process.argv[2].trim() : null);

  if (!fs.existsSync(path.join(ROOT, '.env'))) {
    console.error('请先在项目根目录配置 .env，包含 SENSORTOWER_API_TOKEN');
    process.exit(1);
  }

  if (!fs.existsSync(listPath)) {
    console.error('未找到 app 列表文件:', listPath);
    console.error('请创建 data/appid_list.json，格式: [ {"app_id": "xxx", "platform": "ios"}, ... ]');
    process.exit(1);
  }

  const listPathArg = path.isAbsolute(listPath) ? listPath : path.relative(ROOT, listPath) || 'data/appid_list.json';
  run(
    '1/3 拉取 App 列表 Metadata',
    `node fetch_applist_metadata_to_db.js --force ${listPathArg}`
  );

  const dateArg = mondayArg ? ` ${mondayArg}` : '';
  run(
    '2/3 拉取上周与上上周 Revenue/Download',
    `node fetch_applist_sales_to_db.js ${listPathArg}${dateArg}`
  );

  run(
    '3/3 生成 App 列表 AI 总结',
    `node generate_applist_ai_summary.js${dateArg}`
  );

  console.log('\n' + '='.repeat(60));
  console.log('App 列表周报工作流完成');
  console.log('  - app_metadata：列表内 app 已更新');
  console.log('  - app_list_weekly_sales：上周、上上周 downloads/revenue 已写入');
  console.log('  - applist_ai_summary：已生成 AI 总结（按产品逐条记录）');
  console.log('='.repeat(60));
}

main();
