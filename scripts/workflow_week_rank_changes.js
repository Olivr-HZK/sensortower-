#!/usr/bin/env node
/**
 * 指定周工作流：拉取该周榜单、生成异动、拉取 app metadata 与下载/收益，全部写入数据库。
 *
 * 顺序：
 *   1. fetch_top100_to_db.js [本周一]  → 抓取本周一 + 上周一的 iOS/Android Top100，写入 apple_top100 / android_top100
 *   2. generate_rank_changes_from_db.js [本周一] → 比对生成榜单异动，写入 rank_changes + 榜单异动.csv
 *   3. fetch_app_metadata_to_db.js     → 从 Top100 表取 app_id，拉取 metadata 写入 app_metadata
 *   4. fetch_rank_changes_sales.js [本周一] → 拉取异动应用的下载/收益，写回 rank_changes（end_date=本周一）
 *   5. refill_rank_changes_publisher.js   → 为 rank_changes 补全 publisher_name、store_url
 *
 * 运行：
 *   node workflow_week_rank_changes.js 2026-02-02
 *        → 指定「本周一」为 2026-02-02，完整跑完上述 5 步（默认数据库 sensortower_top100.db）
 *   node workflow_week_rank_changes.js 2026-02-02 my.db
 *        → 使用 my.db 作为 SQLite 数据库文件（不存在则在步骤 1 中创建）
 *        → 指定「本周一」为 2026-02-02，完整跑完上述 5 步
 *
 * 依赖：.env 中配置 SENSORTOWER_API_TOKEN；系统有 sqlite3。
 */

const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'sensortower_top100.db');

function run(name, cmd, dbFile) {
  console.log('\n' + '='.repeat(60));
  console.log('[工作流]', name);
  console.log('=', 60);
  const env = Object.assign({}, process.env);
  if (dbFile) env.SENSORTOWER_DB_FILE = dbFile;
  execSync(cmd, {
    cwd: path.join(ROOT, 'scripts'),
    stdio: 'inherit',
    shell: true,
    env,
  });
}

function main() {
  const monday = process.argv[2];
  if (!monday || !/^\d{4}-\d{2}-\d{2}$/.test(monday.trim())) {
    console.error('用法: node workflow_week_rank_changes.js <本周一 YYYY-MM-DD>');
    console.error('示例: node workflow_week_rank_changes.js 2026-02-02');
    process.exit(1);
  }
  const m = monday.trim();
  const dbArg = process.argv[3];
  const dbFile = dbArg
    ? (path.isAbsolute(dbArg) ? dbArg : path.join(ROOT, dbArg))
    : path.join(ROOT, 'data', 'sensortower_top100.db');

  if (!fs.existsSync(path.join(ROOT, '.env'))) {
    console.error('请先在项目根目录配置 .env，包含 SENSORTOWER_API_TOKEN');
    process.exit(1);
  }

  run(
    '1/5 抓取指定周 Top100（本周一 + 上周一）',
    `node fetch_top100_to_db.js ${m}`,
    dbFile
  );
  run(
    '2/5 生成榜单异动',
    `node generate_rank_changes_from_db.js ${m}`,
    dbFile
  );
  run(
    '3/5 拉取 App Metadata（ios + android）',
    'node fetch_app_metadata_to_db.js',
    dbFile
  );
  run(
    '4/5 拉取异动应用的下载/收益',
    `node fetch_rank_changes_sales.js ${m}`,
    dbFile
  );
  run(
    '5/5 补全异动表的开发者/公司、商店链接',
    'node refill_rank_changes_publisher.js',
    dbFile
  );

  console.log('\n' + '='.repeat(60));
  console.log('指定周工作流全部完成。本周一:', m);
  console.log('  - apple_top100 / android_top100：已写入指定两周数据');
  console.log('  - rank_changes：异动 + downloads/revenue + publisher_name + store_url');
  console.log('  - app_metadata：Top100 涉及的 app 已拉取');
  console.log('  - 榜单异动.csv：已更新');
  console.log('='.repeat(60));
}

main();
