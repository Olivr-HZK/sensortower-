#!/usr/bin/env node
/**
 * 简单测试脚本：只测试一条竞品动态写库逻辑。
 *
 * 会调用 fetch_competitor_dynamics_to_db.js 暴露的 fetchCompetitorDynamics，
 * 仅对第一个竞品公司（COMPETITORS 中的第一条）跑一次 unified/publishers/apps，
 * 并将结果写入 competitor_dynamics 表。
 *
 * 使用：
 *   node test_fetch_competitor_dynamics_one.js
 */

const path = require('path');

// 确保和主脚本在同一目录下
const ROOT = __dirname;
const { fetchCompetitorDynamics, COMPETITORS } = require(path.join(
  ROOT,
  'fetch_competitor_dynamics_to_db.js'
));

async function main() {
  const ids = Object.keys(COMPETITORS);
  if (ids.length === 0) {
    console.error('COMPETITORS 列表为空，无法测试。');
    process.exit(1);
  }
  const firstId = ids[0];
  const info = COMPETITORS[firstId];
  console.log(
    '仅测试一条竞品：',
    firstId,
    '=>',
    info ? info.name : 'UNKNOWN'
  );

  await fetchCompetitorDynamics({ onlyPublisherIds: [firstId] });
  console.log('\n测试完成：请在 sqlite 中查询 competitor_dynamics 表确认结果。');
}

main().catch((err) => {
  console.error('测试执行失败：', err.message);
  process.exit(1);
});

