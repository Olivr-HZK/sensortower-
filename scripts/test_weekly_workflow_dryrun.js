#!/usr/bin/env node
/**
 * 测试脚本：跑一遍「每周工作流」，但所有写入只落在临时副本数据库中，不影响正式库。
 *
 * 等价于：
 *   1) workflow_week_rank_changes.js <本周一> <临时 DB>
 *   2) weekly_us_free_top100_storeinfo.js --date <本周一>（同样指向临时 DB）
 *
 * 用法（项目根目录）：
 *   node scripts/test_weekly_workflow_dryrun.js
 *     → 自动计算本周一日期，基于 data/sensortower_top100.db 拷贝出一份临时 DB 进行完整流程演练
 *
 *   node scripts/test_weekly_workflow_dryrun.js 2026-02-09
 *     → 指定本周一日期为 2026-02-09，其他相同
 *
 * 注意：
 *   - 正式库：data/sensortower_top100.db 永远不会被修改
 *   - 临时库：data/sensortower_top100_dryrun.db，每次运行会被覆盖重建
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MAIN_DB = path.join(ROOT, 'data', 'sensortower_top100.db');
const DRYRUN_DB = path.join(ROOT, 'data', 'sensortower_top100_dryrun.db');

// 为子进程准备「cron 友好」的 PATH，确保能找到 sqlite3 / node 等
const CRON_FRIENDLY_PATH = [
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/opt/homebrew/bin',
  process.env.PATH,
].filter(Boolean).join(':');

function getThisMonday() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day; // Sunday -> last Monday; others -> this Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

function runCommand(name, cmd, dbFile) {
  console.log('\n' + '='.repeat(60));
  console.log('[DRYRUN]', name);
  console.log('命令:', cmd);
  console.log('使用临时数据库:', dbFile);
  console.log('='.repeat(60));

  const env = Object.assign({}, process.env);
  env.PATH = CRON_FRIENDLY_PATH;
  if (dbFile) env.SENSORTOWER_DB_FILE = dbFile;

  try {
    execSync(cmd, {
      cwd: path.join(ROOT, 'scripts'),
      stdio: 'inherit',
      shell: true,
      env,
    });
    console.log(`[DRYRUN] ✓ ${name} 执行成功`);
    return true;
  } catch (e) {
    console.error(`[DRYRUN] ✗ ${name} 执行失败:`, e.message);
    return false;
  }
}

function prepareDryrunDb() {
  // 确保 data 目录存在
  const dataDir = path.dirname(DRYRUN_DB);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 如果已存在旧的 dryrun DB，先删除
  if (fs.existsSync(DRYRUN_DB)) {
    fs.unlinkSync(DRYRUN_DB);
  }

  if (fs.existsSync(MAIN_DB)) {
    fs.copyFileSync(MAIN_DB, DRYRUN_DB);
    console.log('[DRYRUN] 已从正式库拷贝一份临时数据库:', DRYRUN_DB);
  } else {
    // 若正式库不存在，让后续脚本在临时 DB 上自行建表
    console.log('[DRYRUN] 正式库不存在，将使用空的临时数据库:', DRYRUN_DB);
    // 这里不强制创建文件，sqlite3 在首次写入时会自动创建
  }
}

function main() {
  const arg = process.argv[2];
  let monday;
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg.trim())) {
    monday = arg.trim();
  } else if (arg) {
    console.error('用法: node scripts/test_weekly_workflow_dryrun.js [本周一 YYYY-MM-DD]');
    process.exit(1);
  } else {
    monday = getThisMonday();
  }

  console.log('\n' + '='.repeat(60));
  console.log('启动「每周工作流 DRYRUN 测试」');
  console.log('本周一日期:', monday);
  console.log('正式库:', MAIN_DB);
  console.log('临时库:', DRYRUN_DB);
  console.log('说明: 所有写入仅发生在临时库，不影响正式库。');
  console.log('='.repeat(60));

  prepareDryrunDb();

  const nodePath = process.execPath;
  let success = 0;
  let fail = 0;

  // 1) 完整周报工作流（Top100 + 异动 + metadata + 下载/收益 + Top5 文案等）
  if (runCommand(
    '完整周报工作流（workflow_week_rank_changes.js）',
    `"${nodePath}" workflow_week_rank_changes.js ${monday} "${DRYRUN_DB}"`,
    DRYRUN_DB
  )) {
    success++;
  } else {
    fail++;
  }

  // 2) US 免费榜商店页爬取与变更检测
  if (runCommand(
    'US 免费榜商店页爬取与变更检测（weekly_us_free_top100_storeinfo.js）',
    `"${nodePath}" weekly_us_free_top100_storeinfo.js --date ${monday}`,
    DRYRUN_DB
  )) {
    success++;
  } else {
    fail++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('每周工作流 DRYRUN 测试结束。');
  console.log('成功步骤数:', success, '/ 2');
  console.log('失败步骤数:', fail, '/ 2');
  console.log('临时数据库文件（可自行用 sqlite3 查看）:', DRYRUN_DB);
  console.log('正式数据库未被修改。');
  console.log('='.repeat(60));

  if (fail > 0) {
    process.exit(1);
  }
}

main();

