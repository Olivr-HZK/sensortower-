#!/usr/bin/env node
/**
 * 从 SensorTower unified/publishers/apps 接口获取所有竞品公司的当前产品数
 * （iOS / Android / 总数），写入本地 SQLite：competitor_dynamics 表。
 *
 * - 竞品公司列表与 Google Apps Script 中 market_monitor_v1.6.js 的 COMPETITORS 保持一致
 * - 不依赖 npm 额外包，仅使用 Node 内置模块 + sqlite3 CLI
 *
 * 使用方式：
 *   1. 在项目根目录配置 .env，包含：SENSORTOWER_API_TOKEN=你的token
 *   2. 默认数据库文件：sensortower_top100.db（可用环境变量 SENSORTOWER_DB_FILE 覆盖）
 *   3. 运行：
 *        node fetch_competitor_dynamics_to_db.js        # 跑全部竞品
 *        node fetch_competitor_dynamics_to_db.js test   # 只跑一条（用于简单测试）
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// 与其他脚本保持一致的 DB 文件定位逻辑
const DB_FILE = process.env.SENSORTOWER_DB_FILE
  ? (path.isAbsolute(process.env.SENSORTOWER_DB_FILE)
      ? process.env.SENSORTOWER_DB_FILE
      : path.join(__dirname, process.env.SENSORTOWER_DB_FILE))
  : path.join(__dirname, 'sensortower_top100.db');

// unified Publisher API（与 market_monitor_v1.6.js 一致）
const BASE_URL_UNIFIED = 'https://api.sensortower.com/v1';

// 与 Google Apps Script 中的 COMPETITORS 保持一致
// key 为 unified_id，value 为 { name, remark }
const COMPETITORS = {
  "5b6de3cab80f52168dc0abc3": {name: "Onesoft", remark: "Onesoft"},
  "67f43cbca12e6eabea635546": {name: "Hungry Studio", remark: "Hungry Studio"},
  "65670b56ad4adb650837a435": {name: "Miniclip", remark: "Easybrain"},
  "5a63fb6f68c90d39d2db5430": {name: "Tripledot Studios", remark: "Tripledot"},
  "65dcc4c25d0a0d46ffa216a3": {name: "Oakever Games", remark: "Learnings 乐信"},
  "5bb5a48345f4430ad72c6f04": {name: "SayGames", remark: "SayGames"},
  "5f16a8019f7b275235017613": {name: "Dream Games", remark: "Peak Games"},
  "5614b32f3f07e2077c000488": {name: "Take-Two Interactive", remark: "Rollic"},
  "594825d017ddb671190015b5": {name: "Bravestars", remark: "Bravestars"},
  "5d2fbddaa930d848e7aa88ba": {name: "GamoVation", remark: "Gamovation"},
  "5ef3a979f26fe50eefaa9733": {name: "iKame", remark: "iKame"},
  "592cc9f811f9436cc900106f": {name: "Azur Interactive Games", remark: "Azur Games"},
  "66e49e03ef947792202cd239": {name: "Onetap Global", remark: "Onetap"},
  "587424e50211a6a5ca000014": {name: "LinkDesks", remark: "Linkdesks 上海正朗"},
  "58b9c038b61df00ad000053c": {name: "HDuo Fun Games", remark: "Wedobest 多比特"},
  "60168fa5093af068d37d591c": {name: "Infinite Joy", remark: "Amber 琥珀"},
  "6721d46efc576bfd6c44a187": {name: "Funvent Studios", remark: "Spearmint / Nanocraft Tech"},
  "63768eb6d42f2337ca2d36da": {name: "Pleasure City (Orange One Limited)", remark: "Mavericks 小牛"},
  "63374485a396804c23a527ad": {name: "Gamincat", remark: ""},
  "61dc87afc810262315a60422": {name: "Kiwi Fun", remark: ""},
  "6807b41285a660aa1dae74da": {name: "PixOn Games", remark: ""},
  "66ebae4c7f5656ef4bd5033e": {name: "Shycheese", remark: "Wedobest 多比特"},
  "66bbb858fd00e31ff5e3c10f": {name: "Yolo Game Studios", remark: "YOLO Game Studios"},
  "5ea34dde53445f7c0565ab81": {name: "CDT Puzzle Studio", remark: "EZTech and CDT Games"},
  "65a0decef51fe627f7fd1424": {name: "Playful Bytes", remark: "Amber 琥珀"},
  "685ec889fcc8fc31d5c73fc3": {name: "Wonderful Studio", remark: "Hungry Studio"},
  "5dbec896e1752a11b27a157f": {name: "Inspired Square", remark: "Inspired Square"},
  "667eca2699303115f86f8deb": {name: "Grand Games", remark: "Grand Games"},
  "64cac5a6bd9b7e1a439f38f7": {name: "Flyfox Games", remark: "Wonder Kingdom 北京奇妙王国"},
  "5fb093ca01d84d39ef92f617": {name: "Playvalve", remark: ""},
  "59bad4eb63f2dc0d0b9689e1": {name: "Voodoo", remark: "Voodoo"},
  "65397b518249cf5508fcd011": {name: "LifePulse Puzzle Game Studio", remark: "Mavericks 小牛"},
  "682b491a3d66f351a3f659e1": {name: "Bobodoo", remark: "Wonder Kingdom 北京奇妙王国"},
  "5f0fc64047db28734a5a9eee": {name: "GameLord 3D", remark: "Wedobest 多比特"},
  "663cda937e5100795c510fbf": {name: "Mindscaplay", remark: "Wedobest 多比特"},
  "64e3c2aa1949fa14f07b557f": {name: "Higame Global", remark: "HiGame"},
  "5cec389405a5de78e6a8b627": {name: "Unico Studio", remark: ""},
  "625a1cbea4c1c0074ae95baf": {name: "Burny Games", remark: "Burny Games"},
  "63cee0f74fbc9029e789d783": {name: "Brainworks Publishing", remark: "Lihuhu"},
  "6836edacc8b1f059a935e87e": {name: "Gloryway Puzzle Hub", remark: "Wedobest 多比特"},
  "64221856f2c9e344c7723c37": {name: "Playflux", remark: "Code Dish Minifox Limtied ihandy?"},
  "60206b0f1baf9812203ddd87": {name: "Hitapps", remark: "Hitapps / Gismart"},
  "642d6e5c84ba8f10eaa30826": {name: "Topsmart Mobile", remark: "Amber 琥珀"},
  "6525af28ead1220e96d8c834": {name: "Joymaster Studio", remark: "Mavericks 小牛"},
  "5b80c33bb1c72b11eae31bbc": {name: "FlyBird Casual Games", remark: "Dragon Plus Games 天龙互娱"},
  "5d96ee7e618bc048a1d5e03": {name: "Fomo Games", remark: "CrazyLabs(和 Easybrain一个母公司)"},
  "620d3b8db3ae27635539cde2": {name: "Century Games", remark: "DianDian / Century Games"},
  "5628919a02ac648b280040aa": {name: "Fugo Games", remark: "Fugo"},
  "601f98a5a36b7a5097a39027": {name: "Game Maker", remark: "上海迪果科技"},
  "631a670339181751e92fa431": {name: "Wonder Group Holdings", remark: "广州勇往科技"},
  "56c6d6a579a7562c530288a5": {name: "Hua Weiwei", remark: "RedInfinity 红海无限"},
  "6849b5c9ee19fd72d8016608": {name: "Funfinity", remark: "Vigafun"},
  "5614ba793f07e25d29002259": {name: "ZiMAD", remark: ""},
  "5d66d8f487801862f07ec1ee": {name: "Solitaire Card Studio", remark: "Wonder Kingdom 北京奇妙王国"},
  "651fe3928a858346ee6d0aa3": {name: "Joyteractive", remark: "Hitapps / Gismart"},
  "5cf897ca2c440a5283cc4eb5": {name: "IEC Global", remark: ""},
  "689d815e4fc8b9135bad56c7": {name: "Astrasen Play", remark: "MicroEra / 多比特?"},
  "68127a2c6659376b6e55bef7": {name: "Big Cake Group", remark: "上海迪果科技"},
  "6501576d83d0fb4e3ed51650": {name: "Play and Leisure Studio", remark: "深圳市多乐玩网络科技有限公司"},
  "66d7d08a0720566bb8a5d54f": {name: "Lumi Games", remark: "Amber 琥珀"},
  "588ab5299ae66e55fa00069b": {name: "Fancy Game", remark: "明途真 前CEO"},
  "6525bd311b5155311bfee368": {name: "EasyFun Puzzle Game Studio", remark: "Mavericks 小牛"},
  "691f0587d375840a1ca627d1": {name: "Gloryway Puzzle", remark: "Wedobest 多比特"},
  "654ad951df5f391064deeed9": {name: "LoveColoring Game", remark: "Pixo Game? 阿里出来的，广州团队"},
  "5ac11769cda0a725093af67f": {name: "Block Puzzle Games 2018", remark: "Puzzle Cats"},
  "6359d88fca32e644c3543d30": {name: "Dark Halo", remark: "Wedobest 多比特"},
  "686578e84d4d4ff94576a4eb": {name: "Chongqing Hong Hai Wu Xian Technology Development", remark: "RedInfinity 红海无限"},
  "56294c543f07e236f9035025": {name: "Doodle Mobile", remark: "Doodle Mobile 涂鸦移动"},
  "64b98e090f35c7034e8f9654": {name: "People Lovin Games", remark: "Zhongbo Network 中博网络"},
  "638ca1a0e69e3b76be6b986d": {name: "Clap Palms", remark: "Wedobest 多比特"},
  "63ec2c5f5de32a0dd1a4cee0": {name: "BitEpoch", remark: "多比特"},
  "67b47d5327e2c1851797ba24": {name: "Nebula Studio", remark: "Hungry Studio"},
  "5628a28602ac6486a704b87c": {name: "Wuhan Dobest Information Technology", remark: ""},
  "61cebcfc431cd31ee46baf86": {name: "Happibits", remark: "Playdayy 北京天天玩家"},
  "66889cac3ff3669f4c27617d": {name: "CrazyArt", remark: "Pixo Game? 阿里出来的，广州团队"},
  "5e9245531dd03f737fbd47fb": {name: "Longwind Studio", remark: "Mavericks 小牛"},
  "66e194e9045fe72f8f5b39ef": {name: "Mirror of Ember", remark: "MicroEra / 多比特?"},
  "677e01dd9731cd0b14001b7e": {name: "Apollo Mobile Games", remark: "Apollo Games"},
  "5cfdb16e3f3d365878619c4f": {name: "Lihuhu", remark: "Lihuhu"},
  "67f96580d5a7dd8677e147dc": {name: "Little Whale Game", remark: "明途真 前CEO"},
  "6728f4e87a6aae9d02b5bc13": {name: "JollyStorm", remark: "Wedobest 多比特"},
  "691699bb46967ac135075ecd": {name: "Beijing Youyoutang Technology Co.,ltd.", remark: "RedInfinity 红海无限"},
  "5b987a73a8910117fe4435e3": {name: "DragonPlus (Techvision Pte. Ltd.)", remark: "Dragon Plus Games 天龙互娱"},
  "611a889d29053f535bb856c1": {name: "Puzzle Games Studio", remark: "Mavericks 小牛"},
  "60960fd2ec1eca639c9a6663": {name: "Puzzle Studio", remark: "Mavericks 小牛"},
  "63dab6c94d59be60222eb7e0": {name: "Tap Color Studio", remark: "DianDian / Century Games"},
  "5e1779d5b9ab946e28b387bb": {name: "Shanghai Diguo Network Technology", remark: "上海迪果科技"},
  "67692069a370a40ce012c45c": {name: "HK-Halo", remark: "广州勇往科技"},
  "5be64738aaeb8366a74502b0": {name: "Kerun Games", remark: "Wedobest 多比特"},
  "63e404d91d7ec34c7b35fc3f": {name: "MicroEra", remark: "MicroEra / 多比特?"},
  "56289c8802ac6486a7001395": {name: "MobilityWare", remark: ""},
  "672252c73940617c304b377b": {name: "正飞 李", remark: ""},
  "67259da3c8818f5b6b5a8fbe": {name: "Fancy Studios", remark: "明途真 前CEO"},
  "6268adbc1800976402b0d6b3": {name: "Greyfun Games", remark: "Aged Studio Limited 广州帕图拉"},
  "6459b09cfbea7c79994f1aba": {name: "Vita Studio", remark: "Learnings 乐信"},
  "562949573f07e236f9016a9d": {name: "Mouse Games", remark: "Doodle Mobile 涂鸦移动"},
  "5b109b00719d2449d453e623": {name: "DG&G", remark: "RedInfinity 红海无限"},
  "66212a07b3ae270a602a4cb4": {name: "Talefun", remark: "DianDian / Century Games"},
  "635c91ab1a076b2d1f077fd5": {name: "ZeroMaze", remark: "Wedobest 多比特"},
  "5c22bdf33bc04070985f98c1": {name: "Aged Studio", remark: "Aged Studio Limited 广州帕图拉"},
  "624fa1ee7013304f877a9332": {name: "Meta Slots", remark: "Dragon Plus Games 天龙互娱"},
  "66f1e71b8eb20d0bc8648d72": {name: "IEC Holding", remark: ""},
  "62b4bf40beceda18c98d21f5": {name: "WeMaster Games", remark: "AdOne"},
  "66ea9001fb320c325840addd": {name: "Cedar Games Studio", remark: "Learnings 乐信"},
  "62d0d5b6b3ae277089b17654": {name: "Kim Chinh Nguyen Thi", remark: "Onesoft"},
  "62678478ff5a4c36af553034": {name: "Wonderful Entertainment", remark: "Wonder Kingdom 北京奇妙王国"},
  "641dffd76aec9c0569f87f74": {name: "Sugame", remark: "Suga Technology"},
  "5917b4bad68a7037c5000742": {name: "Fun Free Fun", remark: "RedInfinity 红海无限"},
  "63797dd69fbbdf0e75e5e3c0": {name: "Yelo Hood", remark: "多比特"},
  "694154765eed3c212625e8ce": {name: "Funjoy Island", remark: "Betta Games 贝塔科技"},
  "55f896148ac350426b04550c": {name: "Suga", remark: "Suga Technology"},
  "5d2ff8a34c077137e43d5743": {name: "Xian Fu", remark: "HiPlay (Hong Kong) Technology 广州嗨玩网络"},
  "62bca86efb131e180290f3c3": {name: "Joy Vendor", remark: "Betta Games 贝塔科技"},
  "67258f3b3471a040ef6d5258": {name: "文婷 刘", remark: ""},
  "636e08b4cdf90546b5391c8f": {name: "Hai Yen Nguyen Thi", remark: "VigaFun"},
  "5ba09e212f488b69da6188ad": {name: "Metajoy", remark: "成都橙风趣游"},
  "67881b42890a17c184c9a688": {name: "逸雯 杨", remark: ""},
  "65bd4adf95b5d17f9108b14a": {name: "Playdayy", remark: "Playdayy 北京天天玩家"},
  "5b5f6035d3758415fff0a0a6": {name: "CanaryDroid", remark: "Doodle Mobile 涂鸦移动"},
  "663a8094421e85789a70c605": {name: "Art Coloring Group", remark: "Pixo Game? 阿里出来的，广州团队"},
  "639d414105cf073974c60f05": {name: "Playbox Studio", remark: "广州勇往科技"},
  "63f68039378ef136cd4f8720": {name: "Betta Games", remark: "Betta Games 贝塔科技"},
  "60b8493f08154d4551d944ca": {name: "Never Old", remark: "Aged Studio Limited 广州帕图拉"},
  "5b7b1a4824f9a71e50f49fcc": {name: "Casual Joy", remark: "Dragon Plus Games 天龙互娱"},
  "5cc34eda1eadb650cd17b2d6": {name: "Puzzle Cats", remark: "Puzzle Cats"},
  "654d4a1312454e0b7741a5b2": {name: "Amazbit", remark: "Playdayy 北京天天玩家"},
  "6787a2d1e7c09d718e8ab8e2": {name: "Faith Play", remark: "9snail 广州蜗牛互动"},
  "5b486ccd5e77e7409fe3ed50": {name: "Solitaire Games Free", remark: "Puzzle Cats"},
  "5ad09c6bd1a0664eefec1384": {name: "Jing Du", remark: ""},
  "6675eca3a8262c08debfeba4": {name: "HiPlay", remark: "HiPlay (Hong Kong) Technology 广州嗨玩网络"},
  "65f1e87b57f500648b57f1dd": {name: "Passion Fruit Joy", remark: "Amber 琥珀"},
  "5b60b203a77fc07df1522cbb": {name: "Italic Games", remark: "Doodle Mobile 涂鸦移动"},
  "61785552fd6e0c1661bff3c9": {name: "Big Cake Apps", remark: "上海迪果科技"},
  "63a933961cb80e4c3b9a98e5": {name: "Perfeggs", remark: "波克城市"},
  "67583bc5acaabb677ccdbbd6": {name: "SOLOVERSE", remark: "Newborn Town 赤子城"},
  "65a117f57ae5ba7238cc9917": {name: "WinPlus Games", remark: "Winplus Fun HK"},
};

// ----------------- 通用工具函数 -----------------

function loadEnvToken() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('请在项目根目录创建 .env，并配置 SENSORTOWER_API_TOKEN');
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
            return reject(
              new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`)
            );
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

// ----------------- SQLite 相关 -----------------

function assertSqlite3Exists() {
  try {
    execSync('sqlite3 -version', { stdio: 'ignore' });
  } catch (e) {
    console.error('未检测到 sqlite3 命令，请先在系统中安装 sqlite3 再运行本脚本。');
    process.exit(1);
  }
}

function runSql(sql, silent) {
  const compact = sql
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const safe = compact.replace(/"/g, '""');
  const cmd = `sqlite3 "${DB_FILE}" "${safe}"`;
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: silent ? 'pipe' : 'inherit',
  });
}

function escapeSqlValue(v) {
  return String(v).replace(/'/g, "''");
}

function initDb() {
  const ddl = `
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS competitor_dynamics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fetched_at TEXT NOT NULL,
      publisher_id TEXT NOT NULL,
      publisher_name TEXT NOT NULL,
      remark TEXT DEFAULT '',
      ios_app_count INTEGER NOT NULL,
      android_app_count INTEGER NOT NULL,
      total_app_count INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (fetched_at, publisher_id)
    );
    CREATE INDEX IF NOT EXISTS idx_competitor_dynamics_pub ON competitor_dynamics (publisher_id);

    CREATE TABLE IF NOT EXISTS competitor_apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fetched_at TEXT NOT NULL,
      publisher_id TEXT NOT NULL,
      publisher_name TEXT NOT NULL,
      unified_app_id TEXT NOT NULL,
      unified_app_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      app_id TEXT NOT NULL,
      app_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (app_id, platform)
    );
    CREATE INDEX IF NOT EXISTS idx_competitor_apps_publisher ON competitor_apps (publisher_id);
    CREATE INDEX IF NOT EXISTS idx_competitor_apps_unified ON competitor_apps (unified_app_id);
  `;
  runSql(ddl, true);
}

// ----------------- 调 unified/publishers/apps -----------------

/**
 * 调用 unified/publishers/apps 获取某个发行商当前的全部 App，统计数量并展开为 app 行（unified_id/name + app_id/name 一一对应，便于去重）
 * @param {string} publisherId - unified_id
 * @param {string} authToken
 * @returns {Promise<{iosCount:number, androidCount:number, appRows:Array<{publisher_id,publisher_name,unified_app_id,unified_app_name,platform,app_id,app_name}>}>}
 */
async function fetchPublisherApps(publisherId, authToken) {
  const params = {
    unified_id: publisherId,
    auth_token: authToken,
  };
  const url = `${BASE_URL_UNIFIED}/unified/publishers/apps?${buildQuery(params)}`;
  console.log('  请求:', url.replace(authToken, '***'));

  try {
    const data = await fetchJson(url);
    const apps = (data && data.apps) || [];
    const publisherName = (data && data.unified_publisher_name) || '';
    let iosCount = 0;
    let androidCount = 0;
    const appRows = [];

    for (const item of apps) {
      const unifiedAppId = item.unified_app_id || '';
      const unifiedAppName = item.unified_app_name || '';

      if (item.ios_apps && Array.isArray(item.ios_apps)) {
        iosCount += item.ios_apps.length;
        for (const a of item.ios_apps) {
          appRows.push({
            publisher_id: publisherId,
            publisher_name: publisherName,
            unified_app_id: unifiedAppId,
            unified_app_name: unifiedAppName,
            platform: 'ios',
            app_id: String(a.app_id != null ? a.app_id : ''),
            app_name: String(a.app_name != null ? a.app_name : ''),
          });
        }
      }
      if (item.android_apps && Array.isArray(item.android_apps)) {
        androidCount += item.android_apps.length;
        for (const a of item.android_apps) {
          appRows.push({
            publisher_id: publisherId,
            publisher_name: publisherName,
            unified_app_id: unifiedAppId,
            unified_app_name: unifiedAppName,
            platform: 'android',
            app_id: String(a.app_id != null ? a.app_id : ''),
            app_name: String(a.app_name != null ? a.app_name : ''),
          });
        }
      }
    }

    return { iosCount, androidCount, appRows };
  } catch (e) {
    console.error('  -> 请求失败:', e.message);
    return { iosCount: -1, androidCount: -1, appRows: [] };
  }
}

/**
 * 主函数：获取竞品动态并写入 competitor_dynamics
 * @param {Object} [options]
 * @param {string[]} [options.onlyPublisherIds] - 若传入，则只处理这些 publisher_id（用于测试）
 */
async function fetchCompetitorDynamics(options = {}) {
  const authToken = loadEnvToken();
  assertSqlite3Exists();
  initDb();

  const fetchedAt = new Date().toISOString();
  const ids = options.onlyPublisherIds && options.onlyPublisherIds.length
    ? options.onlyPublisherIds
    : Object.keys(COMPETITORS);

  console.log('将处理竞品公司数量：', ids.length);
  const summaryRows = [];
  const allAppRows = [];

  for (let i = 0; i < ids.length; i++) {
    const publisherId = ids[i];
    const info = COMPETITORS[publisherId] || { name: 'UNKNOWN', remark: '' };
    console.log(
      `\n[${i + 1}/${ids.length}] ${info.name} (${publisherId})`
    );

    const { iosCount, androidCount, appRows } = await fetchPublisherApps(
      publisherId,
      authToken
    );

    const total = iosCount >= 0 && androidCount >= 0 ? iosCount + androidCount : -1;
    summaryRows.push({
      fetchedAt,
      publisherId,
      publisherName: info.name,
      remark: info.remark || '',
      iosCount,
      androidCount,
      total,
    });

    for (const row of appRows) {
      allAppRows.push({
        fetchedAt,
        publisher_id: row.publisher_id,
        publisher_name: row.publisher_name,
        unified_app_id: row.unified_app_id,
        unified_app_name: row.unified_app_name,
        platform: row.platform,
        app_id: row.app_id,
        app_name: row.app_name,
      });
    }

    // 避免过快触发限流
    if (i + 1 < ids.length) {
      await sleep(300);
    }
  }

  if (summaryRows.length === 0) {
    console.log('没有可写入的数据。');
    return;
  }

  const summaryValues = summaryRows
    .map((r) => {
      return `('${escapeSqlValue(r.fetchedAt)}','${escapeSqlValue(
        r.publisherId
      )}','${escapeSqlValue(r.publisherName)}','${escapeSqlValue(
        r.remark
      )}',${r.iosCount},${r.androidCount},${r.total})`;
    })
    .join(',');

  runSql(`
    BEGIN;
    INSERT OR IGNORE INTO competitor_dynamics
      (fetched_at, publisher_id, publisher_name, remark, ios_app_count, android_app_count, total_app_count)
    VALUES ${summaryValues};
    COMMIT;
  `, true);

  if (allAppRows.length > 0) {
    const BATCH = 500;
    for (let b = 0; b < allAppRows.length; b += BATCH) {
      const batch = allAppRows.slice(b, b + BATCH);
      const appValues = batch
        .map((r) => {
          return `('${escapeSqlValue(r.fetchedAt)}','${escapeSqlValue(r.publisher_id)}','${escapeSqlValue(r.publisher_name)}','${escapeSqlValue(r.unified_app_id)}','${escapeSqlValue(r.unified_app_name)}','${escapeSqlValue(r.platform)}','${escapeSqlValue(r.app_id)}','${escapeSqlValue(r.app_name)}')`;
        })
        .join(',');
      runSql(`
        INSERT OR REPLACE INTO competitor_apps
          (fetched_at, publisher_id, publisher_name, unified_app_id, unified_app_name, platform, app_id, app_name)
        VALUES ${appValues};
      `, true);
    }
    console.log(
      '\n已写入 competitor_apps 条数：',
      allAppRows.length,
      '（unified_app_id/name + app_id/name 一一对应，UNIQUE(app_id, platform) 去重）'
    );
  }

  console.log(
    '\n已写入 competitor_dynamics 条数：',
    summaryRows.length,
    '数据库：',
    DB_FILE
  );
}

// 直接命令行执行时：默认跑全部；若传入 "test" 参数则只跑一条（简单测试）
if (require.main === module) {
  const mode = process.argv[2] && process.argv[2].toLowerCase();
  if (mode === 'test') {
    const firstId = Object.keys(COMPETITORS)[0];
    fetchCompetitorDynamics({ onlyPublisherIds: [firstId] })
      .catch((err) => {
        console.error('执行失败：', err.message);
        process.exit(1);
      });
  } else {
    fetchCompetitorDynamics()
      .catch((err) => {
        console.error('执行失败：', err.message);
        process.exit(1);
      });
  }
}

// 导出给其它脚本（例如更细粒度测试）
module.exports = {
  fetchCompetitorDynamics,
  COMPETITORS,
};

