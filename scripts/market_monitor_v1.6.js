/**
 * ============================================
 * 📊 市场趋势监测系统 - Puzzle 品类 v1.6
 * ============================================
 * 更新：
 * - 竞品列表扩展到 136 家公司
 * - 新增备注列（自用_开发者）方便识别
 * - 表格结构优化（7列）
 */

// 配置属性键名
var CONFIG_KEYS = {
  API_TOKEN: "sensortower_api_token",
  GOOGLE_DOC_ID: "weeklyReportDocId"
};

// 获取配置值（优先从PropertiesService读取，如果没有则返回默认值）
function getConfig(key, defaultValue) {
  var value = PropertiesService.getDocumentProperties().getProperty(key);
  return value || defaultValue;
}

// 设置配置值
function setConfig(key, value) {
  PropertiesService.getDocumentProperties().setProperty(key, value);
}

var CONFIG = {
  // API Token 从配置中读取，如果没有配置则使用默认值
  get API_TOKEN() {
    return getConfig(CONFIG_KEYS.API_TOKEN, "");
  },
  
  BASE_URL: "https://api.sensortower.com/v1",
  COUNTRIES: ["US", "JP", "GB", "DE", "IN"],
  
  // iOS 配置
  CATEGORY_IOS: "7012",
  CHART_TYPES_IOS: ["topfreeapplications", "topgrossingapplications"],
  
  // Android 配置（参数格式不同！）
  CATEGORY_ANDROID: "game_puzzle",
  CHART_TYPES_ANDROID: ["topselling_free", "topgrossing"],
  
  DOWNLOAD_THRESHOLD: 5000,
  RANK_CHANGE_THRESHOLD: 20,
  RANK_VOLATILITY_THRESHOLD: 30,
  NEW_ENTRY_TOP: 50,
  
  // App Store 链接模板
  APP_STORE_URL: "https://apps.apple.com/app/id",
  GOOGLE_PLAY_URL: "https://play.google.com/store/apps/details?id=",
  
  // 新品监控配置
  NEW_APP_DAYS: 60  // 监控最近N天发布的新品
};

// 竞品公司列表（136家）
// name: SensorTower上的发行商名称
// remark: 自用备注（方便识别）
var COMPETITORS = {
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
  "5d96ee7e6188bc048a1d5e03": {name: "Fomo Games", remark: "CrazyLabs(和 Easybrain一个母公司)"},
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
  "65a117f57ae5ba7238cc9917": {name: "WinPlus Games", remark: "Winplus Fun HK"}
};

var COUNTRY_NAMES = {
  "US": "🇺🇸 美国",
  "JP": "🇯🇵 日本",
  "GB": "🇬🇧 英国",
  "DE": "🇩🇪 德国",
  "IN": "🇮🇳 印度"
};

// chart_type 显示名称映射
var CHART_TYPE_NAMES = {
  "topfreeapplications": "免费榜",
  "topgrossingapplications": "畅销榜",
  "topselling_free": "免费榜",
  "topgrossing": "畅销榜"
};

// ============================================
// 📌 创建自定义菜单
// ============================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 市场监测')
    .addItem('🔄 一键更新所有数据', 'updateAllData')
    .addSeparator()
    .addSubMenu(ui.createMenu('📱 榜单数据')
      .addItem('iOS Top Charts', 'fetchIOSTopCharts')
      .addItem('Android Top Charts', 'fetchAndroidTopCharts')
      .addItem('全部 Top Charts', 'fetchAllTopCharts'))
    .addSubMenu(ui.createMenu('📈 分析报告')
      .addItem('榜单异动分析', 'analyzeRankChanges')
      .addItem('起量产品识别', 'identifyRisingApps')
      .addItem('生成周报汇总', 'generateWeeklyReport')
      .addItem('📄 导出周报到 Doc', 'exportWeeklyReportToDoc'))
    .addSubMenu(ui.createMenu('👀 竞品监控')
      .addItem('竞品公司动态', 'fetchCompetitorApps')
      .addItem('竞品新品上线', 'fetchNewReleases')
      .addItem('▶️ 继续跑剩余竞品', 'continueRemainingCompetitors')
      .addSeparator()
      .addItem('📅 扫描历史新品', 'scanHistoricalNewApps')
      .addItem('📊 起量分析', 'analyzeRisingApps')
      .addItem('🔄 重置扫描进度', 'resetScanProgress')
      .addSeparator()
      .addItem('📝 更新备注（批量）', 'updateRemarks')
      .addItem('🔁 重跑单个公司', 'refetchSinglePublisher')
      .addItem('📋 复制新品到基准库', 'copyNewAppsToBase')
      .addItem('🗑️ 重置基准库', 'resetAppDatabase'))
    .addSeparator()
    .addItem('⚙️ 设置', 'showSettings')
    .addItem('🔑 配置 API Key', 'configureAPIKey')
    .addItem('📄 配置 Google Doc', 'configureGoogleDoc')
    .addItem('🧪 测试 API', 'testAPIConnection')
    .addToUi();
}

// ============================================
// 🔧 工具函数
// ============================================
function buildQueryString(params) {
  var parts = [];
  for (var key in params) {
    if (params.hasOwnProperty(key) && params[key] !== undefined && params[key] !== null) {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    }
  }
  return parts.join('&');
}

function getDateString(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - (daysAgo || 0));
  var year = d.getFullYear();
  var month = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return year + '-' + month + '-' + day;
}

function callAPI(endpoint, params, platform) {
  platform = platform || "ios";
  var apiToken = CONFIG.API_TOKEN;
  if (!apiToken || apiToken === "") {
    throw new Error("请先配置 SensorTower API Token！请在菜单中点击「🔑 配置 API Key」");
  }
  params.auth_token = apiToken;
  var queryString = buildQueryString(params);
  var fullUrl = CONFIG.BASE_URL + "/" + platform + endpoint + "?" + queryString;
  
  Logger.log("API Call: " + fullUrl);
  
  try {
    var response = UrlFetchApp.fetch(fullUrl, {
      method: "GET",
      muteHttpExceptions: true
    });
    
    var statusCode = response.getResponseCode();
    var content = response.getContentText();
    
    if (statusCode === 200) {
      return { success: true, data: JSON.parse(content) };
    } else {
      Logger.log("API Error " + statusCode + ": " + content.substring(0, 500));
      return { success: false, status: statusCode, message: content };
    }
  } catch (e) {
    Logger.log("Request Error: " + e.toString());
    return { success: false, message: e.toString() };
  }
}

function getOrCreateSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function setSheetHeaders(sheet, headers, bgColor) {
  // 检查表头是否已存在
  var existingHeaders = [];
  if (sheet.getLastRow() >= 1) {
    existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  }
  
  // 比较表头是否一致
  var headersMatch = true;
  if (existingHeaders.length === headers.length) {
    for (var i = 0; i < headers.length; i++) {
      if (existingHeaders[i] !== headers[i]) {
        headersMatch = false;
        break;
      }
    }
  } else {
    headersMatch = false;
  }
  
  // 只有表头不匹配时才设置（不清空数据）
  if (!headersMatch) {
    // 只设置表头行，不清空整个表
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground(bgColor || "#4285f4")
      .setFontColor("white");
  }
}

// 清空表格并设置表头（用于需要重置的场景）
function clearAndSetHeaders(sheet, headers, bgColor) {
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground(bgColor || "#4285f4")
    .setFontColor("white");
}

// 强制自动调整所有列宽（适应内容）
function autoFitColumns(sheet, numColumns) {
  for (var i = 1; i <= numColumns; i++) {
    sheet.autoResizeColumn(i);
  }
  // 刷新确保生效
  SpreadsheetApp.flush();
}

// 生成商店链接
function getStoreUrl(appId, platform) {
  platform = platform || "ios";
  if (platform.toLowerCase() === "ios") {
    return CONFIG.APP_STORE_URL + appId;
  } else {
    return CONFIG.GOOGLE_PLAY_URL + appId;
  }
}

// 创建带超链接的公式
function createHyperlinkFormula(text, url) {
  var safeText = String(text).replace(/"/g, '""');
  return '=HYPERLINK("' + url + '","' + safeText + '")';
}

// ============================================
// 🔍 批量获取应用名称
// ============================================
function fetchAppNames(appIds, platform) {
  var nameMap = {};
  var uniqueIds = [];
  
  var idSet = {};
  for (var i = 0; i < appIds.length; i++) {
    if (appIds[i] && !idSet[appIds[i]]) {
      idSet[appIds[i]] = true;
      uniqueIds.push(appIds[i]);
    }
  }
  
  if (uniqueIds.length === 0) return nameMap;
  
  var batchSize = 30;
  platform = platform || "ios";
  var category = platform === "ios" ? CONFIG.CATEGORY_IOS : CONFIG.CATEGORY_ANDROID;
  var chartType = platform === "ios" ? "topfreeapplications" : "topselling_free";
  
  for (var i = 0; i < uniqueIds.length; i += batchSize) {
    var batch = uniqueIds.slice(i, i + batchSize);
    var batchIds = batch.join(",");
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "获取应用名称 " + (i + 1) + "-" + Math.min(i + batchSize, uniqueIds.length) + "/" + uniqueIds.length,
      "加载中", 3
    );
    
    var result = callAPI("/category/category_history", {
      app_ids: batchIds,
      category: category,
      chart_type_ids: chartType,
      countries: "US"
    }, platform);
    
    if (result.success) {
      for (var appId in result.data) {
        if (appId === "lines") continue;
        var appData = result.data[appId];
        if (appData && appData["US"]) {
          var catData = appData["US"][category];
          if (catData && catData[chartType]) {
            nameMap[appId] = catData[chartType].name || 
                           catData[chartType].humanized_app_name || 
                           appId;
          }
        }
      }
    }
    
    Utilities.sleep(400);
  }
  
  return nameMap;
}

// ============================================
// 🧪 测试 API 连接
// ============================================
function testAPIConnection() {
  var ui = SpreadsheetApp.getUi();
  SpreadsheetApp.getActiveSpreadsheet().toast("正在测试 API...", "测试中", 10);
  
  // 测试 iOS
  var iosResult = callAPI("/ranking", {
    category: CONFIG.CATEGORY_IOS,
    chart_type: "topfreeapplications",
    country: "US",
    date: getDateString(1)
  }, "ios");
  
  // 测试 Android
  var androidResult = callAPI("/ranking", {
    category: CONFIG.CATEGORY_ANDROID,
    chart_type: "topselling_free",
    country: "US",
    date: getDateString(1)
  }, "android");
  
  var message = "";
  if (iosResult.success) {
    message += "✅ iOS API 正常\n";
  } else {
    message += "❌ iOS API 失败\n";
  }
  
  if (androidResult.success) {
    message += "✅ Android API 正常\n";
  } else {
    message += "❌ Android API 失败\n";
  }
  
  ui.alert("API 测试结果", message, ui.ButtonSet.OK);
}

// ============================================
// 📱 获取 Top Charts 榜单
// ============================================
function fetchAllTopCharts() {
  fetchIOSTopCharts();
  Utilities.sleep(2000);
  fetchAndroidTopCharts();
}

function fetchIOSTopCharts() {
  fetchTopCharts("ios", CONFIG.CATEGORY_IOS, CONFIG.CHART_TYPES_IOS, "iOS Top Charts");
}

function fetchAndroidTopCharts() {
  fetchTopCharts("android", CONFIG.CATEGORY_ANDROID, CONFIG.CHART_TYPES_ANDROID, "Android Top Charts");
}

function fetchTopCharts(platform, category, chartTypes, sheetName) {
  var sheet = getOrCreateSheet(sheetName);
  var headers = ["排名", "App ID", "应用名称", "国家", "榜单类型", "平台", "抓取日期"];
  setSheetHeaders(sheet, headers, platform === "ios" ? "#007AFF" : "#34A853");
  
  var allData = [];
  var allAppIds = [];
  var dateStr = getDateString(1);
  var timestamp = getDateString(0);
  
  for (var i = 0; i < CONFIG.COUNTRIES.length; i++) {
    var country = CONFIG.COUNTRIES[i];
    
    for (var j = 0; j < chartTypes.length; j++) {
      var chartType = chartTypes[j];
      var chartTypeName = CHART_TYPE_NAMES[chartType] || chartType;
      
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "获取 " + platform.toUpperCase() + " " + COUNTRY_NAMES[country] + " " + chartTypeName,
        "加载中", 3
      );
      
      var result = callAPI("/ranking", {
        category: category,
        chart_type: chartType,
        country: country,
        date: dateStr
      }, platform);
      
      if (result.success && result.data && result.data.ranking) {
        var ranking = result.data.ranking;
        for (var k = 0; k < Math.min(ranking.length, 100); k++) {
          allAppIds.push(ranking[k]);
          allData.push({
            rank: k + 1,
            appId: ranking[k],
            name: "",
            country: COUNTRY_NAMES[country],
            chartType: chartTypeName,
            platform: platform.toUpperCase(),
            date: timestamp
          });
        }
      } else {
        Logger.log("Failed to fetch " + platform + " " + country + " " + chartType);
      }
      
      Utilities.sleep(300);
    }
  }
  
  if (allData.length > 0) {
    // 获取应用名称
    SpreadsheetApp.getActiveSpreadsheet().toast("正在获取应用名称...", "加载中", 10);
    var nameMap = fetchAppNames(allAppIds, platform);
    
    // 写入数据（带超链接）
    for (var i = 0; i < allData.length; i++) {
      var row = allData[i];
      var appId = row.appId;
      var appName = nameMap[appId] || appId;  // 如果没有名称，显示 App ID
      var storeUrl = getStoreUrl(appId, platform);
      
      var rowNum = i + 2;
      sheet.getRange(rowNum, 1).setValue(row.rank);
      sheet.getRange(rowNum, 2).setValue(appId);
      sheet.getRange(rowNum, 3).setFormula(createHyperlinkFormula(appName, storeUrl));
      sheet.getRange(rowNum, 4).setValue(row.country);
      sheet.getRange(rowNum, 5).setValue(row.chartType);
      sheet.getRange(rowNum, 6).setValue(row.platform);
      sheet.getRange(rowNum, 7).setValue(row.date);
    }
    
    autoFitColumns(sheet, headers.length);
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      platform.toUpperCase() + " 获取完成！共 " + allData.length + " 条",
      "✅ 完成", 5
    );
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      platform.toUpperCase() + " 未获取到数据，请检查 API",
      "⚠️", 5
    );
  }
}

// ============================================
// 📈 榜单异动分析（带超链接）
// ============================================
function analyzeRankChanges() {
  var sheet = getOrCreateSheet("📈 榜单异动");
  var headers = ["信号", "应用名称", "App ID", "国家", "平台", "本周排名", "上周排名", "变化", "异动类型"];
  setSheetHeaders(sheet, headers, "#EA4335");
  
  var currentDate = getDateString(1);
  var lastWeekDate = getDateString(8);
  
  var allChanges = [];
  var allAppIds = [];
  
  // 分析 iOS 和 Android
  var platforms = [
    { name: "ios", category: CONFIG.CATEGORY_IOS, chartType: "topfreeapplications" },
    { name: "android", category: CONFIG.CATEGORY_ANDROID, chartType: "topselling_free" }
  ];
  
  for (var p = 0; p < platforms.length; p++) {
    var platformConfig = platforms[p];
    
    for (var i = 0; i < CONFIG.COUNTRIES.length; i++) {
      var country = CONFIG.COUNTRIES[i];
      
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "分析 " + platformConfig.name.toUpperCase() + " " + COUNTRY_NAMES[country] + " 榜单异动...",
        "分析中", 3
      );
      
      var currentResult = callAPI("/ranking", {
        category: platformConfig.category,
        chart_type: platformConfig.chartType,
        country: country,
        date: currentDate
      }, platformConfig.name);
      
      Utilities.sleep(300);
      
      var lastWeekResult = callAPI("/ranking", {
        category: platformConfig.category,
        chart_type: platformConfig.chartType,
        country: country,
        date: lastWeekDate
      }, platformConfig.name);
      
      if (currentResult.success && lastWeekResult.success) {
        var currentRanking = currentResult.data.ranking || [];
        var lastWeekRanking = lastWeekResult.data.ranking || [];
        
        var lastWeekMap = {};
        for (var j = 0; j < lastWeekRanking.length; j++) {
          lastWeekMap[lastWeekRanking[j]] = j + 1;
        }
        
        for (var k = 0; k < Math.min(currentRanking.length, 50); k++) {
          var appId = currentRanking[k];
          var currentRank = k + 1;
          var lastWeekRank = lastWeekMap[appId];
          
          var changeType = "";
          var signal = "";
          var change = 0;
          
          if (!lastWeekRank) {
            changeType = "🆕 新进榜单";
            signal = "🔴";
            change = "NEW";
            allAppIds.push({ id: appId, platform: platformConfig.name });
            allChanges.push({
              signal: signal,
              appId: appId,
              name: "",
              country: COUNTRY_NAMES[country],
              platform: platformConfig.name.toUpperCase(),
              currentRank: currentRank,
              lastWeekRank: "-",
              change: change,
              changeType: changeType
            });
          } else {
            change = lastWeekRank - currentRank;
            
            if (change >= CONFIG.RANK_CHANGE_THRESHOLD) {
              changeType = "🚀 排名飙升";
              signal = "🔴";
            } else if (change >= 10) {
              changeType = "📈 排名上升";
              signal = "🟡";
            } else if (change <= -CONFIG.RANK_CHANGE_THRESHOLD) {
              changeType = "📉 排名下跌";
              signal = "🟢";
            }
            
            if (changeType) {
              allAppIds.push({ id: appId, platform: platformConfig.name });
              allChanges.push({
                signal: signal,
                appId: appId,
                name: "",
                country: COUNTRY_NAMES[country],
                platform: platformConfig.name.toUpperCase(),
                currentRank: currentRank,
                lastWeekRank: lastWeekRank,
                change: change > 0 ? "↑" + change : "↓" + Math.abs(change),
                changeType: changeType
              });
            }
          }
        }
      }
      
      Utilities.sleep(300);
    }
  }
  
  // 获取应用名称（分平台）
  if (allAppIds.length > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast("正在获取应用名称...", "加载中", 10);
    
    // 分别获取 iOS 和 Android 的名称
    var iosIds = allAppIds.filter(function(item) { return item.platform === "ios"; }).map(function(item) { return item.id; });
    var androidIds = allAppIds.filter(function(item) { return item.platform === "android"; }).map(function(item) { return item.id; });
    
    var iosNameMap = iosIds.length > 0 ? fetchAppNames(iosIds, "ios") : {};
    var androidNameMap = androidIds.length > 0 ? fetchAppNames(androidIds, "android") : {};
    
    for (var i = 0; i < allChanges.length; i++) {
      var platform = allChanges[i].platform.toLowerCase();
      var appId = allChanges[i].appId;
      if (platform === "ios") {
        allChanges[i].name = iosNameMap[appId] || appId;
      } else {
        allChanges[i].name = androidNameMap[appId] || appId;
      }
    }
  }
  
  // 按信号排序
  allChanges.sort(function(a, b) {
    var order = {"🔴": 0, "🟡": 1, "🟢": 2};
    return (order[a.signal] || 3) - (order[b.signal] || 3);
  });
  
  // 写入数据（带超链接）
  if (allChanges.length > 0) {
    for (var i = 0; i < allChanges.length; i++) {
      var row = allChanges[i];
      var rowNum = i + 2;
      var storeUrl = getStoreUrl(row.appId, row.platform.toLowerCase());
      
      sheet.getRange(rowNum, 1).setValue(row.signal);
      sheet.getRange(rowNum, 2).setFormula(createHyperlinkFormula(row.name, storeUrl));
      sheet.getRange(rowNum, 3).setValue(row.appId);
      sheet.getRange(rowNum, 4).setValue(row.country);
      sheet.getRange(rowNum, 5).setValue(row.platform);
      sheet.getRange(rowNum, 6).setValue(row.currentRank);
      sheet.getRange(rowNum, 7).setValue(row.lastWeekRank);
      sheet.getRange(rowNum, 8).setValue(row.change);
      sheet.getRange(rowNum, 9).setValue(row.changeType);
    }
    
    autoFitColumns(sheet, headers.length);
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "发现 " + allChanges.length + " 个异动！（iOS + Android）",
      "✅ 分析完成", 5
    );
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast("本周无明显异动", "📊", 5);
  }
}

// ============================================
// 📈 起量产品识别
// ============================================
function identifyRisingApps() {
  var ui = SpreadsheetApp.getUi();
  ui.alert(
    "💡 提示",
    "起量产品识别需要调用下载量预估 API。\n\n" +
    "请确认你的 API 订阅包含 sales_report_estimates 接口。",
    ui.ButtonSet.OK
  );
  
  var sheet = getOrCreateSheet("📈 起量产品");
  var headers = ["信号", "应用名称", "App ID", "发行商", "日均下载", "周环比", "国家", "平台"];
  setSheetHeaders(sheet, headers, "#FBBC04");
  
  SpreadsheetApp.getActiveSpreadsheet().toast("正在获取下载量数据...", "加载中", 10);
  
  var result = callAPI("/sales_report_estimates_comparison_attributes", {
    category: CONFIG.CATEGORY_IOS,
    countries: "US",
    date: getDateString(1),
    limit: 50
  }, "ios");
  
  if (result.success && Array.isArray(result.data)) {
    for (var i = 0; i < result.data.length; i++) {
      var app = result.data[i];
      var downloads = app.units || app.downloads || 0;
      var signal = downloads >= CONFIG.DOWNLOAD_THRESHOLD ? "🔴" : 
                   downloads >= 2000 ? "🟡" : "🟢";
      var appId = app.app_id || app.id || "";
      var appName = app.name || app.app_name || "Unknown";
      var storeUrl = getStoreUrl(appId, "ios");
      
      var rowNum = i + 2;
      sheet.getRange(rowNum, 1).setValue(signal);
      sheet.getRange(rowNum, 2).setFormula(createHyperlinkFormula(appName, storeUrl));
      sheet.getRange(rowNum, 3).setValue(appId);
      sheet.getRange(rowNum, 4).setValue(app.publisher || app.publisher_name || "");
      sheet.getRange(rowNum, 5).setValue(downloads);
      sheet.getRange(rowNum, 6).setValue(app.change || "-");
      sheet.getRange(rowNum, 7).setValue("🇺🇸 美国");
      sheet.getRange(rowNum, 8).setValue("iOS");
    }
    
    autoFitColumns(sheet, headers.length);
    SpreadsheetApp.getActiveSpreadsheet().toast("获取完成！", "✅", 5);
  } else {
    Logger.log("Download API result: " + JSON.stringify(result));
    SpreadsheetApp.getActiveSpreadsheet().toast("下载量 API 可能需要更高级订阅", "⚠️", 5);
  }
}

// ============================================
// 📄 导出周报到 Google Doc
// ============================================

// 存储 Doc ID 的属性名
var WEEKLY_REPORT_DOC_KEY = "weeklyReportDocId";

/**
 * 导出当前周报汇总到 Google Doc
 */
function exportWeeklyReportToDoc() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("📊 周报汇总");
  
  if (!sheet) {
    ss.toast("请先生成周报汇总！", "⚠️", 5);
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    ss.toast("周报汇总没有数据！", "⚠️", 5);
    return;
  }
  
  ss.toast("正在导出到 Doc...", "⏳", 10);
  
  // 获取或创建 Doc
  var docId = getConfig(CONFIG_KEYS.GOOGLE_DOC_ID, null);
  var doc;
  var isNewDoc = false;
  
  if (docId) {
    try {
      doc = DocumentApp.openById(docId);
      Logger.log("使用现有文档: " + doc.getName());
    } catch (e) {
      Logger.log("无法打开配置的文档，将创建新文档: " + e.toString());
      doc = null;
    }
  }
  
  if (!doc) {
    // 创建新文档
    var docName = "📊 周报汇总归档 - " + ss.getName() + " - " + formatDate(new Date());
    doc = DocumentApp.create(docName);
    docId = doc.getId();
    setConfig(CONFIG_KEYS.GOOGLE_DOC_ID, docId);
    isNewDoc = true;
    
    // 设置文档初始内容
    var body = doc.getBody();
    body.clear();
    body.appendParagraph("📊 市场趋势监测周报归档")
        .setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph("")
        .appendText("本文档用于自动归档每周的市场监测周报。")
        .setFontSize(10)
        .setForegroundColor("#666666");
    body.appendParagraph("");
    body.appendHorizontalRule();
    body.appendParagraph("");
    
    doc.saveAndClose();
    Logger.log("已创建新文档: " + docName + " (ID: " + docId + ")");
  }
  
  var body = doc.getBody();
  
  // 添加分隔线
  body.appendHorizontalRule();
  
  // 从榜单异动表获取数据
  var changeSheet = ss.getSheetByName("📈 榜单异动");
  var newEntries = [];
  var rankUps = [];
  
  if (changeSheet && changeSheet.getLastRow() > 1) {
    var changeData = changeSheet.getDataRange().getValues();
    var changeFormulas = changeSheet.getDataRange().getFormulas();
    
    for (var i = 1; i < changeData.length; i++) {
      var row = changeData[i];
      var formula = changeFormulas[i] ? changeFormulas[i][1] : "";
      var changeType = row[8] || "";
      
      var appName = row[1];
      var appUrl = "";
      if (formula && formula.indexOf('HYPERLINK') >= 0) {
        var nameMatch = formula.match(/,"([^"]+)"\)$/);
        if (nameMatch) appName = nameMatch[1];
        var urlMatch = formula.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
        if (urlMatch) appUrl = urlMatch[1];
      }
      
      if (changeType.indexOf("新进") >= 0) {
        newEntries.push({
          name: appName,
          url: appUrl,
          appId: String(row[2]),
          country: row[3],
          platform: row[4],
          rank: row[5]
        });
      }
      if (changeType.indexOf("飙升") >= 0) {
        rankUps.push({
          name: appName,
          url: appUrl,
          appId: String(row[2]),
          country: row[3],
          platform: row[4],
          rank: row[5],
          change: row[7]
        });
      }
    }
  }
  
  var today = formatDate(new Date());
  var timeStr = new Date().toTimeString().substring(0, 8);
  
  // ========== 标题 ==========
  body.appendParagraph("📊 市场趋势监测周报 - Puzzle 品类")
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("导出时间：" + today + " " + timeStr)
      .setForegroundColor("#666666");
  body.appendParagraph("");
  
  // ========== 本周要点 ==========
  body.appendParagraph("📌 本周要点")
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph("• 本周新进 Top 50：" + newEntries.length + " 款产品（iOS + Android）");
  body.appendParagraph("• 排名飙升产品：" + rankUps.length + " 款");
  body.appendParagraph("• 监控地区：美国、日本、英国、德国、印度");
  body.appendParagraph("• 监控公司：" + Object.keys(COMPETITORS).length + " 家竞品");
  body.appendParagraph("");
  
  // ========== 新进 Top 50 ==========
  if (newEntries.length > 0) {
    body.appendParagraph("🆕 本周新进 Top 50 产品（" + newEntries.length + " 款）")
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    
    var newTable = body.appendTable();
    var headerRow = newTable.appendTableRow();
    var headers = ["应用名称", "平台", "国家", "当前排名"];
    for (var h = 0; h < headers.length; h++) {
      var cell = headerRow.appendTableCell(headers[h]);
      cell.setBackgroundColor("#FFCDD2");
      cell.editAsText().setBold(true);
    }
    
    for (var i = 0; i < newEntries.length; i++) {
      var entry = newEntries[i];
      var dataRow = newTable.appendTableRow();
      
      var nameCell = dataRow.appendTableCell(entry.name || entry.appId);
      if (entry.url) {
        nameCell.editAsText().setLinkUrl(entry.url).setForegroundColor("#1155cc");
      }
      
      dataRow.appendTableCell(entry.platform);
      dataRow.appendTableCell(entry.country);
      dataRow.appendTableCell("#" + entry.rank);
    }
    body.appendParagraph("");
  }
  
  // ========== 排名飙升 Top 10 ==========
  if (rankUps.length > 0) {
    var showCount = Math.min(rankUps.length, 10);
    body.appendParagraph("🚀 排名飙升产品 Top " + showCount)
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    
    var upTable = body.appendTable();
    var upHeaderRow = upTable.appendTableRow();
    var upHeaders = ["应用名称", "平台", "国家", "当前排名", "变化"];
    for (var h = 0; h < upHeaders.length; h++) {
      var cell = upHeaderRow.appendTableCell(upHeaders[h]);
      cell.setBackgroundColor("#C8E6C9");
      cell.editAsText().setBold(true);
    }
    
    for (var i = 0; i < showCount; i++) {
      var entry = rankUps[i];
      var dataRow = upTable.appendTableRow();
      
      var nameCell = dataRow.appendTableCell(entry.name || entry.appId);
      if (entry.url) {
        nameCell.editAsText().setLinkUrl(entry.url).setForegroundColor("#1155cc");
      }
      
      dataRow.appendTableCell(entry.platform);
      dataRow.appendTableCell(entry.country);
      dataRow.appendTableCell("#" + entry.rank);
      dataRow.appendTableCell(String(entry.change));
    }
    body.appendParagraph("");
  }
  
  // 保存
  doc.saveAndClose();
  
  // 显示成功消息和链接
  var docUrl = "https://docs.google.com/document/d/" + docId;
  var ui = SpreadsheetApp.getUi();
  var message = "✅ 导出成功！\n\n";
  
  if (isNewDoc) {
    message += "📄 已自动创建新文档：\n" + doc.getName() + "\n\n";
    message += "文档已保存到你的 Google Drive，\n";
    message += "文档 ID 已自动配置，下次导出将追加到同一文档。\n\n";
  } else {
    message += "周报已追加到现有文档。\n\n";
  }
  
  message += "文档链接：\n" + docUrl + "\n\n";
  message += "💡 提示：每次导出都会追加到同一个文档";
  
  ui.alert(
    "✅ 导出成功！",
    message,
    ui.ButtonSet.OK
  );
}

// ============================================
// 👀 竞品公司动态
// ============================================
function fetchCompetitorApps() {
  var sheet = getOrCreateSheet("👀 竞品动态");
  var headers = ["备注", "公司名称", "Publisher ID", "iOS 产品数", "Android 产品数", "总产品数"];
  setSheetHeaders(sheet, headers, "#9C27B0");
  
  var allData = [];
  var publisherIds = Object.keys(COMPETITORS);
  
  for (var i = 0; i < publisherIds.length; i++) {
    var pubId = publisherIds[i];
    var pubInfo = COMPETITORS[pubId];
    var pubName = pubInfo.name;
    var pubRemark = pubInfo.remark || "";
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "正在获取 " + pubName + " (" + (i + 1) + "/" + publisherIds.length + ")",
      "加载中", 5
    );
    
    // 调用 API 获取该公司所有 App
    var result = callUnifiedPublisherApps(pubId);
    
    if (result.success && result.data && result.data.apps) {
      var apps = result.data.apps;
      var iosCount = 0;
      var androidCount = 0;
      
      for (var j = 0; j < apps.length; j++) {
        if (apps[j].ios_apps && apps[j].ios_apps.length > 0) {
          iosCount += apps[j].ios_apps.length;
        }
        if (apps[j].android_apps && apps[j].android_apps.length > 0) {
          androidCount += apps[j].android_apps.length;
        }
      }
      
      allData.push([pubRemark, pubName, pubId, iosCount, androidCount, iosCount + androidCount]);
    } else {
      allData.push([pubRemark, pubName, pubId, "获取失败", "获取失败", "-"]);
    }
    
    Utilities.sleep(300);
  }
  
  // 从「📦 竞品App库」获取备注映射（以基准库为准）
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var baseSheet = ss.getSheetByName("📦 竞品App库");
  var remarkMap = {}; // 公司名称 -> 备注
  if (baseSheet && baseSheet.getLastRow() > 1) {
    var baseData = baseSheet.getRange(2, 3, baseSheet.getLastRow() - 1, 2).getValues(); // 公司名称, 备注
    for (var i = 0; i < baseData.length; i++) {
      var companyName = baseData[i][0];
      var remark = baseData[i][1];
      if (companyName && remark && !remarkMap[companyName]) {
        remarkMap[companyName] = remark;
      }
    }
  }
  
  // 更新备注（以基准库为准）
  for (var i = 0; i < allData.length; i++) {
    var companyName = allData[i][1]; // 公司名称在第2列
    if (remarkMap[companyName]) {
      allData[i][0] = remarkMap[companyName]; // 更新备注
    }
  }
  
  // 按备注分组排序（同一备注的排在一起），组内按总产品数排序
  allData.sort(function(a, b) {
    var remarkA = a[0] || "";
    var remarkB = b[0] || "";
    if (remarkA !== remarkB) {
      return remarkA.localeCompare(remarkB, 'zh-CN');
    }
    // 同一备注内，按总产品数排序
    var totalA = typeof a[5] === 'number' ? a[5] : 0;
    var totalB = typeof b[5] === 'number' ? b[5] : 0;
    return totalB - totalA;
  });
  
  // 清除旧数据（保留表头）
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }
  
  // 写入新数据
  if (allData.length > 0) {
    sheet.getRange(2, 1, allData.length, headers.length).setValues(allData);
  }
  autoFitColumns(sheet, headers.length);
  
  SpreadsheetApp.getActiveSpreadsheet().toast("竞品公司动态已更新！共 " + publisherIds.length + " 家", "✅", 5);
}

// ============================================
// 🆕 竞品新品上线监控（对比法 - 快速版）
// ============================================

/**
 * 首次运行：建立竞品 App 基准库
 * 后续运行：对比发现新品
 */
function fetchNewReleases() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var baseSheet = getOrCreateSheet("📦 竞品App库");
  var newSheet = getOrCreateSheet("🆕 竞品新品");
  
  // 设置表头（增加备注列）
  var baseHeaders = ["App ID", "应用名称", "公司名称", "备注", "平台", "首次发现日期", "商店链接"];
  var newHeaders = ["发现日期", "应用名称", "App ID", "公司名称", "备注", "平台", "商店链接"];
  setSheetHeaders(baseSheet, baseHeaders, "#607D8B");
  setSheetHeaders(newSheet, newHeaders, "#FF5722");
  
  ss.toast("正在获取竞品 App 数据...", "加载中", 30);
  
  // 1. 读取现有基准库
  var existingApps = {};
  var baseLastRow = baseSheet.getLastRow();
  if (baseLastRow > 1) {
    var baseData = baseSheet.getRange(2, 1, baseLastRow - 1, 1).getValues();
    for (var i = 0; i < baseData.length; i++) {
      if (baseData[i][0]) {
        existingApps[String(baseData[i][0])] = true;
      }
    }
  }
  var existingCount = Object.keys(existingApps).length;
  
  // 2. 获取所有竞品公司的 App
  var allApps = [];
  var newApps = [];
  var publisherIds = Object.keys(COMPETITORS);
  var today = formatDate(new Date());
  
  for (var i = 0; i < publisherIds.length; i++) {
    var pubId = publisherIds[i];
    var pubInfo = COMPETITORS[pubId];
    var pubName = pubInfo.name;
    var pubRemark = pubInfo.remark || "";
    
    ss.toast("获取 " + pubName + " (" + (i + 1) + "/" + publisherIds.length + ")", "加载中", 5);
    
    var result = callUnifiedPublisherApps(pubId);
    
    if (result.success && result.data && result.data.apps) {
      var apps = result.data.apps;
      
      for (var j = 0; j < apps.length; j++) {
        var app = apps[j];
        var unifiedName = app.unified_app_name || "Unknown";
        
        // iOS Apps
        if (app.ios_apps && app.ios_apps.length > 0) {
          for (var k = 0; k < app.ios_apps.length; k++) {
            var iosApp = app.ios_apps[k];
            var appId = String(iosApp.app_id);
            var appName = iosApp.app_name || unifiedName;
            var storeUrl = CONFIG.APP_STORE_URL + appId;
            
            var appRecord = {
              appId: appId,
              appName: appName,
              publisher: pubName,
              remark: pubRemark,
              platform: "iOS",
              firstSeen: today,
              storeUrl: storeUrl
            };
            
            allApps.push(appRecord);
            
            // 检查是否为新品
            if (!existingApps[appId]) {
              newApps.push(appRecord);
            }
          }
        }
        
        // Android Apps
        if (app.android_apps && app.android_apps.length > 0) {
          for (var k = 0; k < app.android_apps.length; k++) {
            var androidApp = app.android_apps[k];
            var appId = String(androidApp.app_id);
            var appName = androidApp.app_name || unifiedName;
            var storeUrl = CONFIG.GOOGLE_PLAY_URL + appId;
            
            var appRecord = {
              appId: appId,
              appName: appName,
              publisher: pubName,
              remark: pubRemark,
              platform: "Android",
              firstSeen: today,
              storeUrl: storeUrl
            };
            
            allApps.push(appRecord);
            
            // 检查是否为新品
            if (!existingApps[appId]) {
              newApps.push(appRecord);
            }
          }
        }
      }
    }
    
    Utilities.sleep(300);
  }
  
  // 3. 判断是首次运行还是后续运行
  if (existingCount === 0) {
    // 首次运行：建立基准库
    ss.toast("首次运行，建立竞品 App 基准库...", "📦", 5);
    
    // 写入基准库（增加备注列）
    var baseData = [];
    for (var i = 0; i < allApps.length; i++) {
      var app = allApps[i];
      baseData.push([app.appId, app.appName, app.publisher, app.remark, app.platform, app.firstSeen, app.storeUrl]);
    }
    
    if (baseData.length > 0) {
      baseSheet.getRange(2, 1, baseData.length, baseHeaders.length).setValues(baseData);
    }
    
    autoFitColumns(baseSheet, baseHeaders.length);
    
    // 清空新品表，写入提示
    var newLastRow = newSheet.getLastRow();
    if (newLastRow > 1) {
      newSheet.getRange(2, 1, newLastRow - 1, newHeaders.length).clearContent();
    }
    newSheet.getRange(2, 1).setValue("✅ 基准库已建立，共 " + allApps.length + " 款 App。下次运行将检测新品！");
    
    ss.toast("基准库已建立！共 " + allApps.length + " 款竞品 App（来自 " + publisherIds.length + " 家公司）", "✅ 完成", 5);
    
  } else {
    // 后续运行：对比发现新品
    
    // 更新基准库（追加新品，包含备注）
    if (newApps.length > 0) {
      var newBaseData = [];
      for (var i = 0; i < newApps.length; i++) {
        var app = newApps[i];
        newBaseData.push([app.appId, app.appName, app.publisher, app.remark, app.platform, app.firstSeen, app.storeUrl]);
      }
      
      var appendRow = baseSheet.getLastRow() + 1;
      baseSheet.getRange(appendRow, 1, newBaseData.length, baseHeaders.length).setValues(newBaseData);
    }
    
    // 更新新品表
    var newLastRow = newSheet.getLastRow();
    if (newLastRow > 1) {
      newSheet.getRange(2, 1, newLastRow - 1, newHeaders.length).clearContent();
    }
    
    if (newApps.length > 0) {
      // 写入新品（增加备注列）
      for (var i = 0; i < newApps.length; i++) {
        var app = newApps[i];
        var rowNum = i + 2;
        
        newSheet.getRange(rowNum, 1).setValue(app.firstSeen);
        newSheet.getRange(rowNum, 2).setFormula(createHyperlinkFormula(app.appName, app.storeUrl));
        newSheet.getRange(rowNum, 3).setValue(app.appId);
        newSheet.getRange(rowNum, 4).setValue(app.publisher);
        newSheet.getRange(rowNum, 5).setValue(app.remark);
        newSheet.getRange(rowNum, 6).setValue(app.platform);
        newSheet.getRange(rowNum, 7).setValue(app.storeUrl);
      }
      
      autoFitColumns(newSheet, newHeaders.length);
      
      ss.toast("🎉 发现 " + newApps.length + " 款新品！", "✅ 完成", 5);
    } else {
      newSheet.getRange(2, 1).setValue("暂无新品（上次检查: " + today + "）");
      ss.toast("暂无新品", "📊", 5);
    }
  }
}

// 需要更新备注的公司
var REMARK_UPDATES = {
  "Wuhan Dobest Information Technology": "多比特",
  "Puzzle Games Studio": "国内开发者 不确定是谁",
  "Puzzle Studio": "PineappleGame 不确定是谁",
  "正飞 李": "9snail 广州蜗牛互动",
  "文婷 刘": "9snail 广州蜗牛互动",
  "逸雯 杨": "9snail 广州蜗牛互动",
  "Faith Play": "9snail 广州蜗牛互动",
  "Jing Du": "小牛"
};

/**
 * 批量更新「🆕 竞品新品」表的备注列
 */
function updateRemarks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("🆕 竞品新品");
  
  if (!sheet) {
    ss.toast("找不到「🆕 竞品新品」表！", "⚠️", 5);
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    ss.toast("表格没有数据！", "⚠️", 5);
    return;
  }
  
  ss.toast("正在更新备注...", "⏳", 10);
  
  // 读取公司名称列（第4列）和备注列（第5列）
  var data = sheet.getRange(2, 4, lastRow - 1, 2).getValues();
  var updatedCount = 0;
  
  for (var i = 0; i < data.length; i++) {
    var pubName = data[i][0];
    var currentRemark = data[i][1];
    
    if (REMARK_UPDATES[pubName] && currentRemark !== REMARK_UPDATES[pubName]) {
      sheet.getRange(i + 2, 5).setValue(REMARK_UPDATES[pubName]);
      updatedCount++;
    }
  }
  
  ss.toast("✅ 已更新 " + updatedCount + " 条备注！", "完成", 5);
}

/**
 * 重跑单个公司的数据（追加到末尾，不删除已有数据）
 */
function refetchSinglePublisher() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 弹窗让用户输入公司名称
  var response = ui.prompt(
    '🔁 重跑单个公司',
    '请输入要重跑的公司名称（如 Unico Studio）：',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  var targetName = response.getResponseText().trim();
  if (!targetName) {
    ss.toast("请输入公司名称！", "⚠️", 5);
    return;
  }
  
  // 在 COMPETITORS 中查找
  var targetPubId = null;
  var targetPubInfo = null;
  var publisherIds = Object.keys(COMPETITORS);
  
  for (var i = 0; i < publisherIds.length; i++) {
    var pubId = publisherIds[i];
    var pubInfo = COMPETITORS[pubId];
    if (pubInfo.name.toLowerCase() === targetName.toLowerCase()) {
      targetPubId = pubId;
      targetPubInfo = pubInfo;
      break;
    }
  }
  
  // 也在 REMAINING_COMPETITORS 中查找
  if (!targetPubId) {
    var remainingIds = Object.keys(REMAINING_COMPETITORS);
    for (var i = 0; i < remainingIds.length; i++) {
      var pubId = remainingIds[i];
      var pubInfo = REMAINING_COMPETITORS[pubId];
      if (pubInfo.name.toLowerCase() === targetName.toLowerCase()) {
        targetPubId = pubId;
        targetPubInfo = pubInfo;
        break;
      }
    }
  }
  
  if (!targetPubId) {
    ss.toast("找不到公司：" + targetName, "⚠️", 5);
    return;
  }
  
  // 确认操作
  var confirmResponse = ui.alert(
    '确认重跑',
    '将重跑「' + targetPubInfo.name + '」的数据，追加到表格末尾。\n\n是否同时删除该公司的旧数据？',
    ui.ButtonSet.YES_NO_CANCEL
  );
  
  if (confirmResponse === ui.Button.CANCEL) {
    return;
  }
  
  var deleteOld = (confirmResponse === ui.Button.YES);
  
  var newSheet = getOrCreateSheet("🆕 竞品新品");
  var newHeaders = ["发现日期", "应用名称", "App ID", "公司名称", "备注", "平台", "商店链接"];
  setSheetHeaders(newSheet, newHeaders, "#FF5722");
  
  // 如果需要删除旧数据
  if (deleteOld) {
    ss.toast("正在删除旧数据...", "⏳", 5);
    var lastRow = newSheet.getLastRow();
    if (lastRow > 1) {
      // 从后往前删除，避免行号变化
      var data = newSheet.getRange(2, 4, lastRow - 1, 1).getValues(); // 公司名称在第4列
      for (var i = data.length - 1; i >= 0; i--) {
        if (data[i][0] === targetPubInfo.name) {
          newSheet.deleteRow(i + 2);
        }
      }
    }
  }
  
  ss.toast("正在获取 " + targetPubInfo.name + " 的数据...", "加载中", 30);
  
  // 读取现有 App ID（去重用）
  var existingApps = {};
  var lastRow = newSheet.getLastRow();
  if (lastRow > 1) {
    var existingData = newSheet.getRange(2, 3, lastRow - 1, 1).getValues();
    for (var i = 0; i < existingData.length; i++) {
      if (existingData[i][0]) {
        existingApps[String(existingData[i][0])] = true;
      }
    }
  }
  
  var today = formatDate(new Date());
  var appendRow = newSheet.getLastRow() + 1;
  var totalAdded = 0;
  
  var result = callUnifiedPublisherApps(targetPubId);
  
  if (result.success && result.data && result.data.apps) {
    var apps = result.data.apps;
    var pubName = targetPubInfo.name;
    var pubRemark = targetPubInfo.remark || "";
    
    for (var j = 0; j < apps.length; j++) {
      var app = apps[j];
      var unifiedName = app.unified_app_name || "Unknown";
      
      // iOS Apps
      if (app.ios_apps && app.ios_apps.length > 0) {
        for (var k = 0; k < app.ios_apps.length; k++) {
          var iosApp = app.ios_apps[k];
          var appId = String(iosApp.app_id);
          var appName = iosApp.app_name || unifiedName;
          var storeUrl = CONFIG.APP_STORE_URL + appId;
          
          if (!existingApps[appId]) {
            newSheet.getRange(appendRow, 1).setValue(today);
            newSheet.getRange(appendRow, 2).setFormula(createHyperlinkFormula(appName, storeUrl));
            newSheet.getRange(appendRow, 3).setValue(appId);
            newSheet.getRange(appendRow, 4).setValue(pubName);
            newSheet.getRange(appendRow, 5).setValue(pubRemark);
            newSheet.getRange(appendRow, 6).setValue("iOS");
            newSheet.getRange(appendRow, 7).setValue(storeUrl);
            appendRow++;
            totalAdded++;
            existingApps[appId] = true;
          }
        }
      }
      
      // Android Apps
      if (app.android_apps && app.android_apps.length > 0) {
        for (var k = 0; k < app.android_apps.length; k++) {
          var androidApp = app.android_apps[k];
          var appId = String(androidApp.app_id);
          var appName = androidApp.app_name || unifiedName;
          var storeUrl = CONFIG.GOOGLE_PLAY_URL + appId;
          
          if (!existingApps[appId]) {
            newSheet.getRange(appendRow, 1).setValue(today);
            newSheet.getRange(appendRow, 2).setFormula(createHyperlinkFormula(appName, storeUrl));
            newSheet.getRange(appendRow, 3).setValue(appId);
            newSheet.getRange(appendRow, 4).setValue(pubName);
            newSheet.getRange(appendRow, 5).setValue(pubRemark);
            newSheet.getRange(appendRow, 6).setValue("Android");
            newSheet.getRange(appendRow, 7).setValue(storeUrl);
            appendRow++;
            totalAdded++;
            existingApps[appId] = true;
          }
        }
      }
    }
    
    autoFitColumns(newSheet, newHeaders.length);
    ss.toast("✅ 完成！" + (deleteOld ? "已删除旧数据，" : "") + "新增 " + totalAdded + " 款 App", "完成", 5);
  } else {
    ss.toast("❌ 获取数据失败！", "错误", 5);
  }
}

// 剩余待跑的竞品（从 Burny Games 开始，共 99 家）
var REMAINING_COMPETITORS = {
  "625a1cbea4c1c0074ae95baf": {name: "Burny Games", remark: "Burny Games"},
  "63cee0f74fbc9029e789d783": {name: "Brainworks Publishing", remark: "Lihuhu"},
  "6836edacc8b1f059a935e87e": {name: "Gloryway Puzzle Hub", remark: "Wedobest 多比特"},
  "64221856f2c9e344c7723c37": {name: "Playflux", remark: "Code Dish Minifox Limtied ihandy?"},
  "60206b0f1baf9812203ddd87": {name: "Hitapps", remark: "Hitapps / Gismart"},
  "642d6e5c84ba8f10eaa30826": {name: "Topsmart Mobile", remark: "Amber 琥珀"},
  "6525af28ead1220e96d8c834": {name: "Joymaster Studio", remark: "Mavericks 小牛"},
  "5b80c33bb1c72b11eae31bbc": {name: "FlyBird Casual Games", remark: "Dragon Plus Games 天龙互娱"},
  "5d96ee7e6188bc048a1d5e03": {name: "Fomo Games", remark: "CrazyLabs(和 Easybrain一个母公司)"},
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
  "65a117f57ae5ba7238cc9917": {name: "WinPlus Games", remark: "Winplus Fun HK"}
};

/**
 * 继续跑剩余的 99 家竞品（从 Burny Games 开始）
 * 追加到现有「🆕 竞品新品」表，不清空已有数据
 */
function continueRemainingCompetitors() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var newSheet = getOrCreateSheet("🆕 竞品新品");
  
  // 设置表头
  var newHeaders = ["发现日期", "应用名称", "App ID", "公司名称", "备注", "平台", "商店链接"];
  setSheetHeaders(newSheet, newHeaders, "#FF5722");
  
  ss.toast("继续跑剩余 99 家竞品...", "加载中", 30);
  
  // 读取现有数据，避免重复
  var existingApps = {};
  var lastRow = newSheet.getLastRow();
  if (lastRow > 1) {
    var existingData = newSheet.getRange(2, 3, lastRow - 1, 1).getValues(); // App ID 在第3列
    for (var i = 0; i < existingData.length; i++) {
      if (existingData[i][0]) {
        existingApps[String(existingData[i][0])] = true;
      }
    }
  }
  
  var publisherIds = Object.keys(REMAINING_COMPETITORS);
  var today = formatDate(new Date());
  var appendRow = newSheet.getLastRow() + 1;
  var totalAdded = 0;
  
  for (var i = 0; i < publisherIds.length; i++) {
    var pubId = publisherIds[i];
    var pubInfo = REMAINING_COMPETITORS[pubId];
    var pubName = pubInfo.name;
    var pubRemark = pubInfo.remark || "";
    
    ss.toast("获取 " + pubName + " (" + (i + 1) + "/" + publisherIds.length + ")", "加载中", 5);
    
    var result = callUnifiedPublisherApps(pubId);
    
    if (result.success && result.data && result.data.apps) {
      var apps = result.data.apps;
      
      for (var j = 0; j < apps.length; j++) {
        var app = apps[j];
        var unifiedName = app.unified_app_name || "Unknown";
        
        // iOS Apps
        if (app.ios_apps && app.ios_apps.length > 0) {
          for (var k = 0; k < app.ios_apps.length; k++) {
            var iosApp = app.ios_apps[k];
            var appId = String(iosApp.app_id);
            var appName = iosApp.app_name || unifiedName;
            var storeUrl = CONFIG.APP_STORE_URL + appId;
            
            if (!existingApps[appId]) {
              newSheet.getRange(appendRow, 1).setValue(today);
              newSheet.getRange(appendRow, 2).setFormula(createHyperlinkFormula(appName, storeUrl));
              newSheet.getRange(appendRow, 3).setValue(appId);
              newSheet.getRange(appendRow, 4).setValue(pubName);
              newSheet.getRange(appendRow, 5).setValue(pubRemark);
              newSheet.getRange(appendRow, 6).setValue("iOS");
              newSheet.getRange(appendRow, 7).setValue(storeUrl);
              appendRow++;
              totalAdded++;
              existingApps[appId] = true;
            }
          }
        }
        
        // Android Apps
        if (app.android_apps && app.android_apps.length > 0) {
          for (var k = 0; k < app.android_apps.length; k++) {
            var androidApp = app.android_apps[k];
            var appId = String(androidApp.app_id);
            var appName = androidApp.app_name || unifiedName;
            var storeUrl = CONFIG.GOOGLE_PLAY_URL + appId;
            
            if (!existingApps[appId]) {
              newSheet.getRange(appendRow, 1).setValue(today);
              newSheet.getRange(appendRow, 2).setFormula(createHyperlinkFormula(appName, storeUrl));
              newSheet.getRange(appendRow, 3).setValue(appId);
              newSheet.getRange(appendRow, 4).setValue(pubName);
              newSheet.getRange(appendRow, 5).setValue(pubRemark);
              newSheet.getRange(appendRow, 6).setValue("Android");
              newSheet.getRange(appendRow, 7).setValue(storeUrl);
              appendRow++;
              totalAdded++;
              existingApps[appId] = true;
            }
          }
        }
      }
    }
    
    Utilities.sleep(300);
  }
  
  autoFitColumns(newSheet, newHeaders.length);
  ss.toast("✅ 完成！新增 " + totalAdded + " 款 App，共 " + (appendRow - 2) + " 款", "完成", 5);
}

/**
 * 将「🆕 竞品新品」的数据复制到「📦 竞品App库」
 * 自动处理列顺序转换
 */
function copyNewAppsToBase() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var newSheet = ss.getSheetByName("🆕 竞品新品");
  var baseSheet = getOrCreateSheet("📦 竞品App库");
  
  if (!newSheet) {
    ss.toast("找不到「🆕 竞品新品」表！", "⚠️", 5);
    return;
  }
  
  var newLastRow = newSheet.getLastRow();
  if (newLastRow <= 1) {
    ss.toast("「🆕 竞品新品」表没有数据！", "⚠️", 5);
    return;
  }
  
  // 确认操作
  var response = ui.alert(
    '📋 确认复制',
    '将把「🆕 竞品新品」的 ' + (newLastRow - 1) + ' 条数据复制到「📦 竞品App库」。\n\n这会清空现有基准库数据，确定继续？',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    return;
  }
  
  ss.toast("正在复制数据...", "⏳", 10);
  
  // 设置基准库表头
  var baseHeaders = ["App ID", "应用名称", "公司名称", "备注", "平台", "首次发现日期", "商店链接"];
  setSheetHeaders(baseSheet, baseHeaders, "#607D8B");
  
  // 清空基准库现有数据
  var baseLastRow = baseSheet.getLastRow();
  if (baseLastRow > 1) {
    baseSheet.getRange(2, 1, baseLastRow - 1, baseHeaders.length).clearContent();
  }
  
  // 读取竞品新品数据
  // 竞品新品列顺序: 发现日期, 应用名称, App ID, 公司名称, 备注, 平台, 商店链接
  var newData = newSheet.getRange(2, 1, newLastRow - 1, 7).getValues();
  
  // 转换列顺序到基准库格式
  // 基准库列顺序: App ID, 应用名称, 公司名称, 备注, 平台, 首次发现日期, 商店链接
  var baseData = [];
  for (var i = 0; i < newData.length; i++) {
    var row = newData[i];
    // row[0] = 发现日期, row[1] = 应用名称, row[2] = App ID, row[3] = 公司名称, row[4] = 备注, row[5] = 平台, row[6] = 商店链接
    baseData.push([
      row[2],  // App ID
      row[1],  // 应用名称
      row[3],  // 公司名称
      row[4],  // 备注
      row[5],  // 平台
      row[0],  // 首次发现日期（原发现日期）
      row[6]   // 商店链接
    ]);
  }
  
  // 写入基准库
  if (baseData.length > 0) {
    baseSheet.getRange(2, 1, baseData.length, baseHeaders.length).setValues(baseData);
  }
  
  autoFitColumns(baseSheet, baseHeaders.length);
  
  ss.toast("✅ 已复制 " + baseData.length + " 条数据到基准库！", "完成", 5);
}

/**
 * 重置基准库（如果需要重新开始）
 */
function resetAppDatabase() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    '⚠️ 确认重置',
    '这将清空竞品 App 基准库，下次运行将重新建立。确定继续？',
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    var baseSheet = getOrCreateSheet("📦 竞品App库");
    var lastRow = baseSheet.getLastRow();
    if (lastRow > 1) {
      baseSheet.getRange(2, 1, lastRow - 1, 6).clearContent();
    }
    SpreadsheetApp.getActiveSpreadsheet().toast("基准库已重置！", "✅", 5);
  }
}

// ============================================
// 📊 起量分析（分析历史新品的买量信号）
// ============================================

/**
 * 分析「📅 历史新品」中的 App 起量情况
 * 检测单日下载量首次突破 2000 的信号
 */
function analyzeRisingApps() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var historySheet = ss.getSheetByName("📅 历史新品");
  var risingSheet = getOrCreateSheet("📊 起量分析");
  var progressSheet = getOrCreateSheet("⏳ 起量分析进度");
  
  if (!historySheet) {
    ss.toast("请先运行「扫描历史新品」！", "⚠️", 5);
    return;
  }
  
  var historyLastRow = historySheet.getLastRow();
  if (historyLastRow <= 1) {
    ss.toast("「📅 历史新品」表没有数据！", "⚠️", 5);
    return;
  }
  
  // 读取进度
  var progress = { processed: 0, total: historyLastRow - 1 };
  var progressLastRow = progressSheet.getLastRow();
  if (progressLastRow > 1) {
    var progressData = progressSheet.getRange(2, 1, 1, 4).getValues()[0];
    if (progressData[0] === "进行中") {
      progress.processed = parseInt(progressData[1]) || 0;
    } else if (progressData[0] === "已完成") {
      ss.toast("起量分析已完成！如需重新分析，请先清空「⏳ 起量分析进度」表", "✅", 5);
      return;
    }
  }
  
  // 设置表头
  var risingHeaders = ["应用名称", "App ID", "公司名称", "备注", "平台", "发布日期", 
                       "🇺🇸美国起量日", "🇺🇸美国峰值", "🇮🇳印度起量日", "🇮🇳印度峰值", 
                       "🇯🇵日本起量日", "🇯🇵日本峰值", "🇬🇧英国起量日", "🇬🇧英国峰值",
                       "🇩🇪德国起量日", "🇩🇪德国峰值", "首个起量地区"];
  var progressHeaders = ["状态", "已处理", "总数", "上次更新"];
  setSheetHeaders(risingSheet, risingHeaders, "#4CAF50");
  setSheetHeaders(progressSheet, progressHeaders, "#9E9E9E");
  
  // 读取历史新品数据
  // 列顺序: 发布日期, 应用名称, App ID, 公司名称, 备注, 平台, 商店链接
  var historyData = historySheet.getRange(2, 1, historyLastRow - 1, 7).getValues();
  
  // 每批处理数量（每个App调5次API，5个地区）
  var batchSize = 60;
  var startIndex = progress.processed;
  var endIndex = Math.min(startIndex + batchSize, historyData.length);
  
  if (startIndex >= historyData.length) {
    ss.toast("起量分析已完成！", "✅", 5);
    return;
  }
  
  ss.toast("开始分析 " + startIndex + " - " + endIndex + " / " + historyData.length, "📊 分析中", 10);
  
  // 读取已分析的 App（避免重复）
  var existingApps = {};
  var risingLastRow = risingSheet.getLastRow();
  if (risingLastRow > 1) {
    var existingData = risingSheet.getRange(2, 2, risingLastRow - 1, 1).getValues();
    for (var i = 0; i < existingData.length; i++) {
      if (existingData[i][0]) {
        existingApps[String(existingData[i][0])] = true;
      }
    }
  }
  
  var appendRow = risingSheet.getLastRow() + 1;
  var processedCount = 0;
  var risingCount = 0;
  
  for (var i = startIndex; i < endIndex; i++) {
    var row = historyData[i];
    var releaseDate = row[0];
    var appName = row[1];
    var appId = String(row[2]);
    var publisher = row[3];
    var remark = row[4];
    var platform = row[5];
    
    if (!appId || existingApps[appId]) {
      processedCount++;
      continue;
    }
    
    // 获取各地区的每日下载数据
    var usData = getDailyDownloads(appId, platform, "US");
    var inData = getDailyDownloads(appId, platform, "IN");
    var jpData = getDailyDownloads(appId, platform, "JP");
    var gbData = getDailyDownloads(appId, platform, "GB");
    var deData = getDailyDownloads(appId, platform, "DE");
    
    // 分析起量信号（首次突破阈值）
    // 印度阈值 5000，其他地区 2000
    var usRising = findFirstRisingDate(usData, 2000);
    var inRising = findFirstRisingDate(inData, 5000);
    var jpRising = findFirstRisingDate(jpData, 2000);
    var gbRising = findFirstRisingDate(gbData, 2000);
    var deRising = findFirstRisingDate(deData, 2000);
    
    // 筛选逻辑：任一地区单日 ≥ 2000 即入选（印度用原始数据判断）
    var inRisingForFilter = findFirstRisingDate(inData, 2000);
    
    // 只记录有起量信号的 App（任一地区起量即记录）
    if (usRising.date || inRisingForFilter.date || jpRising.date || gbRising.date || deRising.date) {
      var firstRisingRegion = getFirstRisingRegion(usRising.date, inRising.date, jpRising.date, gbRising.date, deRising.date);
      
      // 生成商店链接
      var storeUrl = (platform === "iOS") ? CONFIG.APP_STORE_URL + appId : CONFIG.GOOGLE_PLAY_URL + appId;
      
      risingSheet.getRange(appendRow, 1).setFormula(createHyperlinkFormula(appName, storeUrl));
      risingSheet.getRange(appendRow, 2).setValue(appId);
      risingSheet.getRange(appendRow, 3).setValue(publisher);
      risingSheet.getRange(appendRow, 4).setValue(remark);
      risingSheet.getRange(appendRow, 5).setValue(platform);
      risingSheet.getRange(appendRow, 6).setValue(releaseDate);
      risingSheet.getRange(appendRow, 7).setValue(usRising.date || "-");
      risingSheet.getRange(appendRow, 8).setValue(usRising.peak || "-");
      risingSheet.getRange(appendRow, 9).setValue(inRising.date || "-");
      risingSheet.getRange(appendRow, 10).setValue(inRising.peak || "-");
      risingSheet.getRange(appendRow, 11).setValue(jpRising.date || "-");
      risingSheet.getRange(appendRow, 12).setValue(jpRising.peak || "-");
      risingSheet.getRange(appendRow, 13).setValue(gbRising.date || "-");
      risingSheet.getRange(appendRow, 14).setValue(gbRising.peak || "-");
      risingSheet.getRange(appendRow, 15).setValue(deRising.date || "-");
      risingSheet.getRange(appendRow, 16).setValue(deRising.peak || "-");
      risingSheet.getRange(appendRow, 17).setValue(firstRisingRegion);
      
      appendRow++;
      risingCount++;
      existingApps[appId] = true;
    }
    
    processedCount++;
    
    // 每处理 10 个显示一次进度
    if (processedCount % 10 === 0) {
      ss.toast("已处理 " + (startIndex + processedCount) + " / " + historyData.length, "📊 分析中", 3);
    }
    
    Utilities.sleep(200); // 避免 API 限流
  }
  
  // 更新进度
  var newProcessed = startIndex + processedCount;
  var status = (newProcessed >= historyData.length) ? "已完成" : "进行中";
  var now = formatDate(new Date()) + " " + new Date().toTimeString().substring(0, 8);
  
  progressSheet.getRange(2, 1, 1, 4).setValues([[status, newProcessed, historyData.length, now]]);
  
  autoFitColumns(risingSheet, risingHeaders.length);
  
  // 显示结果
  if (status === "已完成") {
    ss.toast("🎉 起量分析完成！发现 " + (risingSheet.getLastRow() - 1) + " 款起量产品", "✅", 5);
  } else {
    var remaining = historyData.length - newProcessed;
    var estimatedRuns = Math.ceil(remaining / batchSize);
    ss.toast(
      "本批完成！发现 " + risingCount + " 款起量产品。\n" +
      "还需运行约 " + estimatedRuns + " 次完成全部分析",
      "⏳ 继续", 5
    );
  }
}

/**
 * 获取 App 在指定国家最近 60 天的每日下载数据
 */
function getDailyDownloads(appId, platform, country) {
  var apiPlatform = (platform === "iOS") ? "ios" : "android";
  var startDate = getDateString(60);
  var endDate = getDateString(1);
  
  var apiToken = CONFIG.API_TOKEN;
  if (!apiToken || apiToken === "") {
    Logger.log("API Token not configured");
    return [];
  }
  
  var url = "https://api.sensortower.com/v1/" + apiPlatform + "/sales_report_estimates"
          + "?app_ids=" + appId
          + "&countries=" + country
          + "&date_granularity=daily"
          + "&start_date=" + startDate
          + "&end_date=" + endDate
          + "&auth_token=" + apiToken;
  
  try {
    var response = UrlFetchApp.fetch(url, {
      method: "GET",
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      // 返回格式: [{aid, cc, d, iu, au}, ...]
      // iu = iPhone units, au = iPad units (iOS)
      // 或 u = units (Android)
      return data;
    }
  } catch (e) {
    Logger.log("getDailyDownloads error for " + appId + ": " + e.toString());
  }
  
  return [];
}

/**
 * 找出首次突破阈值的日期
 * iOS: iu (iPhone) + au (iPad)
 * Android: u (units)
 */
function findFirstRisingDate(data, threshold) {
  var result = { date: null, peak: 0 };
  
  if (!data || !Array.isArray(data) || data.length === 0) return result;
  
  // 按日期排序（从早到晚）
  data.sort(function(a, b) {
    return new Date(a.d) - new Date(b.d);
  });
  
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    // iOS: iu (iPhone) + au (iPad), Android: u
    var downloads = (item.iu || 0) + (item.au || 0) + (item.u || 0);
    var date = item.d;
    
    // 记录峰值
    if (downloads > result.peak) {
      result.peak = downloads;
    }
    
    // 找首次突破阈值的日期
    if (!result.date && downloads >= threshold) {
      result.date = date ? date.substring(0, 10) : null; // 只取日期部分
    }
  }
  
  return result;
}

/**
 * 判断首个起量地区
 */
function getFirstRisingRegion(usDate, inDate, jpDate, gbDate, deDate) {
  var regions = [
    { name: "🇺🇸 美国", date: usDate },
    { name: "🇮🇳 印度", date: inDate },
    { name: "🇯🇵 日本", date: jpDate },
    { name: "🇬🇧 英国", date: gbDate },
    { name: "🇩🇪 德国", date: deDate }
  ];
  
  // 过滤有日期的地区
  var validRegions = regions.filter(function(r) { return r.date; });
  
  if (validRegions.length === 0) return "未起量";
  
  // 按日期排序
  validRegions.sort(function(a, b) {
    return new Date(a.date) - new Date(b.date);
  });
  
  // 返回最早起量的地区
  var first = validRegions[0];
  
  // 检查是否有同一天起量的
  var sameDay = validRegions.filter(function(r) { return r.date === first.date; });
  if (sameDay.length > 1) {
    return sameDay.map(function(r) { return r.name; }).join(" + ");
  }
  
  return first.name;
}

// ============================================
// 📅 扫描历史新品（获取真实发布日期）
// ============================================

/**
 * 扫描基准库，获取真实发布日期，找出最近60天的新品
 * 分批处理，每次约300个App，避免超时
 */
function scanHistoricalNewApps() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var baseSheet = getOrCreateSheet("📦 竞品App库");
  var historySheet = getOrCreateSheet("📅 历史新品");  // 独立的表，不会被其他功能覆盖
  var progressSheet = getOrCreateSheet("⏳ 扫描进度");
  
  // 检查基准库是否存在
  var baseLastRow = baseSheet.getLastRow();
  if (baseLastRow <= 1) {
    ss.toast("请先运行「竞品新品上线」建立基准库！", "⚠️", 5);
    return;
  }
  
  // 【重要】先读取进度，再设置表头
  var progress = {
    processed: 0,
    total: baseLastRow - 1
  };
  
  // 检查进度表是否有数据
  var progressLastRow = progressSheet.getLastRow();
  if (progressLastRow > 1) {
    var progressData = progressSheet.getRange(2, 1, 1, 6).getValues()[0];
    Logger.log("读取到进度数据: " + JSON.stringify(progressData));
    if (progressData[0] === "进行中") {
      progress.processed = parseInt(progressData[1]) || 0;
      Logger.log("继续从 " + progress.processed + " 开始");
    } else if (progressData[0] === "已完成") {
      ss.toast("扫描已完成！如需重新扫描，请先「重置扫描进度」", "✅", 5);
      return;
    }
  }
  
  // 设置表头（不会影响已读取的进度）- 增加备注列
  var historyHeaders = ["发布日期", "应用名称", "App ID", "公司名称", "备注", "平台", "商店链接"];
  var progressHeaders = ["状态", "已处理", "总数", "上次更新", "iOS新品数", "Android新品数"];
  setSheetHeaders(historySheet, historyHeaders, "#E91E63");
  setSheetHeaders(progressSheet, progressHeaders, "#9E9E9E");
  
  // 读取基准库数据（新结构：7列）
  var baseData = baseSheet.getRange(2, 1, baseLastRow - 1, 7).getValues();
  // 列顺序: App ID, 应用名称, 公司名称, 备注, 平台, 首次发现日期, 商店链接
  
  // 计算60天前的时间戳
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.NEW_APP_DAYS);
  var cutoffTimestamp = cutoffDate.getTime();
  
  // 每批处理数量（增加到600，减少运行次数）
  var batchSize = 1000;
  var startIndex = progress.processed;
  var endIndex = Math.min(startIndex + batchSize, baseData.length);
  
  if (startIndex >= baseData.length) {
    ss.toast("扫描已完成！请查看「🆕 竞品新品」表", "✅", 5);
    return;
  }
  
  ss.toast("开始扫描 " + startIndex + " - " + endIndex + " / " + baseData.length, "🔍 扫描中", 10);
  
  var newAppsFound = [];
  var processedCount = 0;
  
  for (var i = startIndex; i < endIndex; i++) {
    var row = baseData[i];
    var appId = String(row[0]);
    var appName = row[1];
    var publisher = row[2];
    var remark = row[3];
    var platform = row[4];
    var storeUrl = row[6];
    
    if (!appId) continue;
    
    // 根据平台调用不同的 API
    var apiPlatform = (platform === "iOS") ? "ios" : "android";
    var releaseDate = getAppReleaseDate(appId, apiPlatform);
    
    if (releaseDate && releaseDate >= cutoffTimestamp) {
      var releaseDateObj = new Date(releaseDate);
      newAppsFound.push({
        releaseDate: formatDate(releaseDateObj),
        releaseDateTimestamp: releaseDate,
        appName: appName,
        appId: appId,
        publisher: publisher,
        remark: remark,
        platform: platform,
        storeUrl: storeUrl
      });
    }
    
    processedCount++;
    
    // 每处理50个显示一次进度
    if (processedCount % 50 === 0) {
      ss.toast("已处理 " + (startIndex + processedCount) + " / " + baseData.length, "🔍 扫描中", 3);
    }
    
    Utilities.sleep(150); // 避免 API 限流
  }
  
  // 更新进度
  var newProcessed = startIndex + processedCount;
  var status = (newProcessed >= baseData.length) ? "已完成" : "进行中";
  var now = formatDate(new Date()) + " " + new Date().toTimeString().substring(0, 8);
  
  progressSheet.getRange(2, 1, 1, 6).setValues([[
    status,
    newProcessed,
    baseData.length,
    now,
    newAppsFound.filter(function(a) { return a.platform === "iOS"; }).length,
    newAppsFound.filter(function(a) { return a.platform === "Android"; }).length
  ]]);
  
  // 追加新品到历史新品表
  if (newAppsFound.length > 0) {
    // 按发布日期排序（最新的在前）
    newAppsFound.sort(function(a, b) {
      return b.releaseDateTimestamp - a.releaseDateTimestamp;
    });
    
    // 读取现有新品（避免重复）
    var existingNewApps = {};
    var historyLastRow = historySheet.getLastRow();
    if (historyLastRow > 1) {
      var existingData = historySheet.getRange(2, 3, historyLastRow - 1, 1).getValues();
      for (var j = 0; j < existingData.length; j++) {
        if (existingData[j][0]) {
          existingNewApps[String(existingData[j][0])] = true;
        }
      }
    }
    
    // 追加不重复的新品
    var appendRow = historySheet.getLastRow() + 1;
    if (appendRow === 2) {
      var firstCellValue = historySheet.getRange(2, 1).getValue().toString();
      if (firstCellValue === "" || firstCellValue.indexOf("基准库") !== -1) {
        historySheet.getRange(2, 1, 1, 7).clearContent();
        appendRow = 2;
      }
    }
    
    var addedCount = 0;
    for (var k = 0; k < newAppsFound.length; k++) {
      var app = newAppsFound[k];
      if (!existingNewApps[app.appId]) {
        historySheet.getRange(appendRow, 1).setValue(app.releaseDate);
        historySheet.getRange(appendRow, 2).setFormula(createHyperlinkFormula(app.appName, app.storeUrl));
        historySheet.getRange(appendRow, 3).setValue(app.appId);
        historySheet.getRange(appendRow, 4).setValue(app.publisher);
        historySheet.getRange(appendRow, 5).setValue(app.remark);
        historySheet.getRange(appendRow, 6).setValue(app.platform);
        historySheet.getRange(appendRow, 7).setValue(app.storeUrl);
        appendRow++;
        addedCount++;
      }
    }
    
    Logger.log("本批新增 " + addedCount + " 款新品到历史新品表");
  }
  
  // 显示结果
  if (status === "已完成") {
    // 对历史新品表按日期排序
    sortHistoricalNewAppsByDate();
    var totalNewApps = historySheet.getLastRow() - 1;
    ss.toast("🎉 扫描完成！共发现 " + totalNewApps + " 款历史新品（最近60天）", "✅", 5);
  } else {
    var remaining = baseData.length - newProcessed;
    var estimatedRuns = Math.ceil(remaining / batchSize);
    ss.toast(
      "本批完成！发现 " + newAppsFound.length + " 款新品。\n" +
      "还需运行约 " + estimatedRuns + " 次完成全部扫描",
      "⏳ 继续", 5
    );
  }
}

/**
 * 获取 App 的发布日期
 */
function getAppReleaseDate(appId, platform) {
  var apiToken = CONFIG.API_TOKEN;
  if (!apiToken || apiToken === "") {
    Logger.log("API Token not configured");
    return null;
  }
  
  var url = "https://api.sensortower.com/v1/" + platform + "/apps/" + appId
          + "?auth_token=" + apiToken;
  
  try {
    var response = UrlFetchApp.fetch(url, {
      method: "GET",
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      // release_date 是毫秒时间戳
      return data.release_date || null;
    }
  } catch (e) {
    Logger.log("Get release date error for " + appId + ": " + e.toString());
  }
  
  return null;
}

/**
 * 对历史新品表按发布日期排序
 */
function sortHistoricalNewAppsByDate() {
  var sheet = getOrCreateSheet("📅 历史新品");
  var lastRow = sheet.getLastRow();
  
  if (lastRow <= 2) return;
  
  var range = sheet.getRange(2, 1, lastRow - 1, 7);
  range.sort({column: 1, ascending: false});
}

/**
 * 重置扫描进度（重新开始扫描）
 */
function resetScanProgress() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    '⚠️ 确认重置',
    '这将重置扫描进度并清空历史新品列表，重新开始扫描。确定继续？',
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    var progressSheet = getOrCreateSheet("⏳ 扫描进度");
    var historySheet = getOrCreateSheet("📅 历史新品");
    
    // 清空进度
    var progressLastRow = progressSheet.getLastRow();
    if (progressLastRow > 1) {
      progressSheet.getRange(2, 1, progressLastRow - 1, 6).clearContent();
    }
    
    // 清空历史新品（7列）
    var historyLastRow = historySheet.getLastRow();
    if (historyLastRow > 1) {
      historySheet.getRange(2, 1, historyLastRow - 1, 7).clearContent();
    }
    
    SpreadsheetApp.getActiveSpreadsheet().toast("进度已重置！请重新运行「扫描历史新品」", "✅", 5);
  }
}

// 调用 unified/publishers/apps 接口
function callUnifiedPublisherApps(publisherId) {
  var apiToken = CONFIG.API_TOKEN;
  if (!apiToken || apiToken === "") {
    return { success: false, message: "API Token not configured" };
  }
  
  var url = "https://api.sensortower.com/v1/unified/publishers/apps"
          + "?unified_id=" + publisherId
          + "&auth_token=" + apiToken;
  
  Logger.log("Unified Publisher API: " + url);
  
  try {
    var response = UrlFetchApp.fetch(url, {
      method: "GET",
      muteHttpExceptions: true
    });
    
    var statusCode = response.getResponseCode();
    var content = response.getContentText();
    
    if (statusCode === 200) {
      return { success: true, data: JSON.parse(content) };
    } else {
      Logger.log("Unified API Error " + statusCode + ": " + content.substring(0, 500));
      return { success: false, status: statusCode, message: content };
    }
  } catch (e) {
    Logger.log("Unified API Request Error: " + e.toString());
    return { success: false, message: e.toString() };
  }
}

// 格式化日期
function formatDate(date) {
  var year = date.getFullYear();
  var month = ('0' + (date.getMonth() + 1)).slice(-2);
  var day = ('0' + date.getDate()).slice(-2);
  return year + '-' + month + '-' + day;
}

// ============================================
// 📊 生成周报汇总（带超链接）
// ============================================
function generateWeeklyReport() {
  var sheet = getOrCreateSheet("📊 周报汇总");
  sheet.clear();
  
  var timestamp = new Date().toLocaleString("zh-CN");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 从榜单异动表获取数据
  var changeSheet = ss.getSheetByName("📈 榜单异动");
  var newEntries = [];
  var rankUps = [];
  
  if (changeSheet) {
    var changeData = changeSheet.getDataRange().getValues();
    var changeFormulas = changeSheet.getDataRange().getFormulas();
    
    for (var i = 1; i < changeData.length; i++) {
      var row = changeData[i];
      var formula = changeFormulas[i] ? changeFormulas[i][1] : "";
      var changeType = row[8] || "";
      
      var appName = row[1];
      if (formula && formula.indexOf('HYPERLINK') >= 0) {
        var match = formula.match(/,"([^"]+)"\)$/);
        if (match) appName = match[1];
      }
      
      if (changeType.indexOf("新进") >= 0) {
        newEntries.push({
          name: appName,
          appId: row[2],
          country: row[3],
          platform: row[4],
          rank: row[5]
        });
      }
      if (changeType.indexOf("飙升") >= 0) {
        rankUps.push({
          name: appName,
          appId: row[2],
          country: row[3],
          platform: row[4],
          rank: row[5],
          change: row[7]
        });
      }
    }
  }
  
  var row = 1;
  
  // 标题
  sheet.getRange(row, 1).setValue("📊 市场趋势监测周报 - Puzzle 品类");
  sheet.getRange(row, 1).setFontSize(18).setFontWeight("bold");
  row++;
  
  sheet.getRange(row, 1).setValue("更新时间：" + timestamp);
  sheet.getRange(row, 1).setFontColor("#666666");
  row += 2;
  
  // ========== 本周要点 ==========
  sheet.getRange(row, 1, 1, 5).merge();
  sheet.getRange(row, 1).setValue("📌 本周要点");
  sheet.getRange(row, 1).setFontSize(14).setFontWeight("bold").setBackground("#E3F2FD");
  row++;
  
  sheet.getRange(row, 1).setValue("• 本周新进 Top 50：" + newEntries.length + " 款产品（iOS + Android）");
  row++;
  sheet.getRange(row, 1).setValue("• 排名飙升产品：" + rankUps.length + " 款");
  row++;
  sheet.getRange(row, 1).setValue("• 监控地区：美国、日本、英国、德国、印度");
  row++;
  sheet.getRange(row, 1).setValue("• 监控公司：" + Object.keys(COMPETITORS).length + " 家竞品");
  row += 2;
  
  // ========== 新进 Top 50 产品列表（带超链接）==========
  if (newEntries.length > 0) {
    sheet.getRange(row, 1, 1, 5).merge();
    sheet.getRange(row, 1).setValue("🆕 本周新进 Top 50 产品（" + newEntries.length + " 款）");
    sheet.getRange(row, 1).setFontSize(14).setFontWeight("bold").setBackground("#FFEBEE");
    row++;
    
    sheet.getRange(row, 1, 1, 5).setValues([["应用名称", "App ID", "平台", "国家", "当前排名"]]);
    sheet.getRange(row, 1, 1, 5).setFontWeight("bold").setBackground("#FFCDD2");
    row++;
    
    for (var i = 0; i < newEntries.length; i++) {
      var entry = newEntries[i];
      var storeUrl = getStoreUrl(entry.appId, entry.platform.toLowerCase());
      var displayName = entry.name || entry.appId;
      
      sheet.getRange(row, 1).setFormula(createHyperlinkFormula(displayName, storeUrl));
      sheet.getRange(row, 2).setValue(entry.appId);
      sheet.getRange(row, 3).setValue(entry.platform);
      sheet.getRange(row, 4).setValue(entry.country);
      sheet.getRange(row, 5).setValue("#" + entry.rank);
      row++;
    }
    row++;
  }
  
  // ========== 排名飙升 Top 10（带超链接）==========
  if (rankUps.length > 0) {
    sheet.getRange(row, 1, 1, 6).merge();
    sheet.getRange(row, 1).setValue("🚀 排名飙升产品 Top " + Math.min(rankUps.length, 10));
    sheet.getRange(row, 1).setFontSize(14).setFontWeight("bold").setBackground("#E8F5E9");
    row++;
    
    sheet.getRange(row, 1, 1, 6).setValues([["应用名称", "App ID", "平台", "国家", "当前排名", "变化"]]);
    sheet.getRange(row, 1, 1, 6).setFontWeight("bold").setBackground("#C8E6C9");
    row++;
    
    var showCount = Math.min(rankUps.length, 10);
    for (var i = 0; i < showCount; i++) {
      var entry = rankUps[i];
      var storeUrl = getStoreUrl(entry.appId, entry.platform.toLowerCase());
      var displayName = entry.name || entry.appId;
      
      sheet.getRange(row, 1).setFormula(createHyperlinkFormula(displayName, storeUrl));
      sheet.getRange(row, 2).setValue(entry.appId);
      sheet.getRange(row, 3).setValue(entry.platform);
      sheet.getRange(row, 4).setValue(entry.country);
      sheet.getRange(row, 5).setValue("#" + entry.rank);
      sheet.getRange(row, 6).setValue(entry.change);
      row++;
    }
    row++;
  }
  
  // ========== 快捷链接 ==========
  sheet.getRange(row, 1, 1, 3).merge();
  sheet.getRange(row, 1).setValue("📑 详细数据表");
  sheet.getRange(row, 1).setFontSize(14).setFontWeight("bold").setBackground("#FFF3E0");
  row++;
  
  sheet.getRange(row, 1).setValue("→ iOS Top Charts");
  row++;
  sheet.getRange(row, 1).setValue("→ Android Top Charts");
  row++;
  sheet.getRange(row, 1).setValue("→ 榜单异动");
  row++;
  sheet.getRange(row, 1).setValue("→ 竞品动态");
  
  autoFitColumns(sheet, 6);
  
  SpreadsheetApp.getActiveSpreadsheet().toast("周报汇总已生成！", "✅", 5);
}

// ============================================
// 🔄 一键更新所有数据
// ============================================
function updateAllData() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    "🔄 一键更新",
    "将执行以下操作：\n\n" +
    "1. 获取 iOS Top Charts\n" +
    "2. 获取 Android Top Charts\n" +
    "3. 分析榜单异动（iOS + Android）\n" +
    "4. 生成周报汇总\n\n" +
    "预计需要 5-8 分钟，是否继续？",
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) return;
  
  SpreadsheetApp.getActiveSpreadsheet().toast("开始更新...", "🚀", 10);
  
  fetchIOSTopCharts();
  Utilities.sleep(2000);
  
  fetchAndroidTopCharts();
  Utilities.sleep(2000);
  
  analyzeRankChanges();
  Utilities.sleep(1000);
  
  generateWeeklyReport();
  
  SpreadsheetApp.getActiveSpreadsheet().toast("🎉 所有数据更新完成！（iOS + Android）", "完成", 10);
}

// ============================================
// 🔑 配置管理
// ============================================

/**
 * 配置 SensorTower API Key
 */
function configureAPIKey() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 获取当前配置
  var currentToken = getConfig(CONFIG_KEYS.API_TOKEN, "");
  var maskedToken = currentToken ? 
    (currentToken.substring(0, 8) + "..." + currentToken.substring(currentToken.length - 4)) : 
    "未配置";
  
  var response = ui.prompt(
    '🔑 配置 SensorTower API Key',
    '当前配置：' + maskedToken + '\n\n请输入新的 API Key：',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    var newToken = response.getResponseText().trim();
    if (newToken) {
      setConfig(CONFIG_KEYS.API_TOKEN, newToken);
      ss.toast("✅ API Key 已保存！", "成功", 3);
      
      // 询问是否立即测试
      var testResponse = ui.alert(
        "✅ 配置成功",
        "API Key 已保存。是否立即测试连接？",
        ui.ButtonSet.YES_NO
      );
      
      if (testResponse === ui.Button.YES) {
        testAPIConnection();
      }
    } else {
      ss.toast("❌ API Key 不能为空！", "错误", 5);
    }
  }
}

/**
 * 配置 Google Doc ID
 */
function configureGoogleDoc() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 获取当前配置
  var currentDocId = getConfig(CONFIG_KEYS.GOOGLE_DOC_ID, "");
  var docInfo = "未配置";
  var docUrl = "";
  
  if (currentDocId) {
    try {
      var doc = DocumentApp.openById(currentDocId);
      docInfo = doc.getName() + "\nID: " + currentDocId;
      docUrl = "https://docs.google.com/document/d/" + currentDocId;
    } catch (e) {
      docInfo = "文档不存在或无法访问\nID: " + currentDocId;
    }
  }
  
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px;">' +
    '<h3 style="color: #4285f4;">📄 配置 Google Doc</h3>' +
    '<p><strong>当前配置：</strong></p>' +
    '<div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0;">' +
    '<pre style="white-space: pre-wrap; word-wrap: break-word;">' + docInfo + '</pre>' +
    (docUrl ? '<p><a href="' + docUrl + '" target="_blank">打开文档</a></p>' : '') +
    '</div>' +
    '<p><strong>配置方式：</strong></p>' +
    '<ol style="line-height: 1.8;">' +
    '<li><strong>方式一（推荐）：</strong>留空，系统会自动创建新文档</li>' +
    '<li><strong>方式二：</strong>输入现有 Google Doc 的 ID<br>' +
    '   （从文档URL中获取，例如：<code>https://docs.google.com/document/d/<strong>DOC_ID</strong>/edit</code>）</li>' +
    '</ol>' +
    '<p><strong>输入 Google Doc ID（留空则自动创建）：</strong></p>' +
    '<input type="text" id="docId" style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px;" placeholder="留空则自动创建新文档" value="' + (currentDocId || "") + '">' +
    '<p style="color: #666; font-size: 12px; margin-top: 10px;">💡 提示：每次导出周报都会追加到同一个文档</p>' +
    '</div>'
  )
  .setWidth(550)
  .setHeight(450);
  
  ui.showModalDialog(html, '📄 配置 Google Doc');
  
  // 由于showModalDialog无法直接返回值，改用prompt方式
  var response = ui.prompt(
    '📄 配置 Google Doc',
    '当前配置：' + (currentDocId || "未配置") + '\n\n' +
    '请输入 Google Doc ID（留空则自动创建新文档）：\n' +
    '（从文档URL中获取，例如：https://docs.google.com/document/d/DOC_ID/edit）',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    var newDocId = response.getResponseText().trim();
    
    if (newDocId) {
      // 验证文档ID是否有效
      try {
        var doc = DocumentApp.openById(newDocId);
        setConfig(CONFIG_KEYS.GOOGLE_DOC_ID, newDocId);
        ss.toast("✅ Google Doc 配置成功！\n文档：" + doc.getName(), "成功", 5);
      } catch (e) {
        ss.toast("❌ 无法访问该文档，请检查 Doc ID 是否正确！", "错误", 5);
      }
    } else {
      // 清空配置，下次导出时会自动创建
      setConfig(CONFIG_KEYS.GOOGLE_DOC_ID, "");
      ss.toast("✅ 已清除配置，下次导出时将自动创建新文档", "成功", 5);
    }
  }
}

// ============================================
// ⚙️ 设置
// ============================================
function showSettings() {
  var ui = SpreadsheetApp.getUi();
  
  var html = HtmlService.createHtmlOutput(
    '<style>' +
    'body { font-family: Arial, sans-serif; padding: 20px; }' +
    'h2 { color: #4285f4; margin-bottom: 20px; }' +
    '.section { margin: 15px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; }' +
    '.section-title { font-weight: bold; color: #333; margin-bottom: 10px; }' +
    '.item { color: #666; font-size: 13px; margin: 5px 0; }' +
    '.tag { display: inline-block; padding: 2px 8px; background: #e3f2fd; border-radius: 4px; margin: 2px; font-size: 12px; }' +
    '.tag-ios { background: #007AFF; color: white; }' +
    '.tag-android { background: #34A853; color: white; }' +
    '</style>' +
    '<h2>⚙️ 系统配置</h2>' +
    
    '<div class="section">' +
    '<div class="section-title">📱 平台支持</div>' +
    '<div class="item">' +
    '<span class="tag tag-ios">iOS</span>' +
    '<span class="tag tag-android">Android</span>' +
    '</div>' +
    '</div>' +
    
    '<div class="section">' +
    '<div class="section-title">📍 监控地区</div>' +
    '<div class="item">' +
    '<span class="tag">🇺🇸 美国</span>' +
    '<span class="tag">🇯🇵 日本</span>' +
    '<span class="tag">🇬🇧 英国</span>' +
    '<span class="tag">🇩🇪 德国</span>' +
    '<span class="tag">🇮🇳 印度</span>' +
    '</div>' +
    '</div>' +
    
    '<div class="section">' +
    '<div class="section-title">🎮 监控品类</div>' +
    '<div class="item">iOS: Puzzle (7012)</div>' +
    '<div class="item">Android: game_puzzle</div>' +
    '</div>' +
    
    '<div class="section">' +
    '<div class="section-title">🏢 竞品公司 (' + Object.keys(COMPETITORS).length + '家)</div>' +
    '<div class="item">' +
    Object.values(COMPETITORS).map(function(name) {
      return '<span class="tag">' + name + '</span>';
    }).join('') +
    '</div>' +
    '</div>' +
    
    '<div class="section">' +
    '<div class="section-title">📊 阈值设置</div>' +
    '<div class="item">起量阈值：日均下载 > ' + CONFIG.DOWNLOAD_THRESHOLD + '</div>' +
    '<div class="item">排名飙升：周环比上升 ≥ ' + CONFIG.RANK_CHANGE_THRESHOLD + ' 位</div>' +
    '<div class="item">新进榜单：首次进入 Top ' + CONFIG.NEW_ENTRY_TOP + '</div>' +
    '</div>' +
    
    '<p style="color: #888; font-size: 12px; margin-top: 20px;">' +
    '💡 如需修改配置，请在 Apps Script 编辑器中修改 CONFIG 和 COMPETITORS 对象' +
    '</p>'
  )
  .setWidth(450)
  .setHeight(550);
  
  ui.showModalDialog(html, '系统配置');
}

// ============================================
// ⏰ 定时任务
// ============================================
function weeklyAutoUpdate() {
  updateAllData();
}
