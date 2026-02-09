#!/usr/bin/env node
/**
 * 通过 App Store 链接爬取应用/游戏详情，使用 Playwright 获取页面，
 * 从 HTML 中解析所需字段，写入 JSON 文件。
 *
 * 用法：
 *   node crawl_appstore.js <store_url> [output.json]
 * 示例：
 *   node crawl_appstore.js "https://apps.apple.com/us/app/screw-world-3d/id1234567890"
 *   node crawl_appstore.js "https://apps.apple.com/us/app/screw-world-3d/id1234567890" out.json
 *   node crawl_appstore.js data/appstore.html out.json  # 从本地HTML文件解析
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT = 'appstore_app.json';

/**
 * 从 HTML 中解析 App Store 应用信息
 */
function parseAppStorePage(html) {
  const result = {
    appId: null,
    appName: null,
    subtitle: null,
    price: null,
    priceType: null,
    rating: null,
    ratingCount: null,
    ageRating: null,
    category: null,
    categoryId: null,
    developer: null,
    developerId: null,
    developerUrl: null,
    languages: [],
    size: null,
    sizeBytes: null,
    iconUrl: null,
    screenshotUrls: [],
    description: null,
    descriptionShort: null,
    releaseNotes: null,
    version: null,
    lastUpdated: null,
    compatibility: null,
    inAppPurchases: false,
    storeUrl: null,
  };

  // 提取应用ID（从URL或meta标签）
  const appIdMatch = html.match(/\/id(\d+)/);
  if (appIdMatch) {
    result.appId = appIdMatch[1];
  }

  // 提取应用名称 (h1标签)
  const nameMatch = html.match(/<h1[^>]*class="[^"]*svelte[^"]*"[^>]*>([^<]+)<\/h1>/);
  if (nameMatch) {
    result.appName = nameMatch[1].trim();
  }

  // 提取副标题 (h2.subtitle)
  const subtitleMatch = html.match(/<h2[^>]*class="[^"]*subtitle[^"]*"[^>]*>([^<]+)<\/h2>/);
  if (subtitleMatch) {
    result.subtitle = subtitleMatch[1].trim();
  }

  // 提取价格和属性 (p.attributes)
  const attributesMatch = html.match(/<p[^>]*class="[^"]*attributes[^"]*"[^>]*>([^<]+)<\/p>/);
  if (attributesMatch) {
    const attrs = attributesMatch[1].trim();
    result.price = attrs;
    
    // 判断价格类型
    if (attrs.includes('Free') || attrs.includes('免费')) {
      result.priceType = 'Free';
    } else if (attrs.includes('$') || attrs.includes('¥') || attrs.includes('€')) {
      result.priceType = 'Paid';
    }
    
    // 判断是否有内购
    if (attrs.includes('In‑App Purchases') || attrs.includes('应用内购买')) {
      result.inAppPurchases = true;
    }
  }

  // 提取评分和评分数量（从badge中）
  // 查找评分badge，格式: "14 Ratings" 和 "4.7"
  const ratingBadgeMatch = html.match(/<span[^>]*class="multiline-clamp__text[^"]*"[^>]*>(\d+)\s*Ratings?<\/span>[\s\S]*?<span[^>]*class="text-container[^"]*"[^>]*>(\d+\.\d+)<\/span>/i);
  if (ratingBadgeMatch) {
    result.ratingCount = parseInt(ratingBadgeMatch[1]);
    result.rating = parseFloat(ratingBadgeMatch[2]);
  } else {
    // 备用方法：分别查找
    const ratingCountMatch = html.match(/<span[^>]*class="multiline-clamp__text[^"]*"[^>]*>(\d+)\s*Ratings?<\/span>/i);
    if (ratingCountMatch) {
      result.ratingCount = parseInt(ratingCountMatch[1]);
    }
    
    const ratingMatch = html.match(/<span[^>]*class="text-container[^"]*"[^>]*aria-hidden="true"[^>]*>(\d+\.\d+)<\/span>/);
    if (ratingMatch) {
      const rating = parseFloat(ratingMatch[1]);
      if (rating >= 0 && rating <= 5) {
        result.rating = rating;
      }
    }
  }

  // 使用更简单的方法提取badge信息
  // 直接查找标签和对应的值
  
  // 提取分类
  const categoryMatch = html.match(/Category[\s\S]*?badge-dd[\s\S]*?multiline-clamp__text[^>]*>([^<]+)<\/span>/);
  if (categoryMatch) {
    result.category = categoryMatch[1].trim();
  }
  
  // 提取开发者
  const developerMatch = html.match(/Developer[\s\S]*?badge-dd[\s\S]*?multiline-clamp__text[^>]*>([^<]+)<\/span>/);
  if (developerMatch) {
    result.developer = developerMatch[1].trim();
  }
  
  // 提取年龄限制
  const ageMatch = html.match(/Ages?[\s\S]*?badge-dd[\s\S]*?<span[^>]*>(\d+)\+<\/span>/);
  if (ageMatch) {
    result.ageRating = ageMatch[1] + '+';
  }
  
  // 提取语言
  const langMatch = html.match(/Language[\s\S]*?badge-dd[\s\S]*?text-container[^>]*>([A-Z]{2})<\/span>/);
  if (langMatch) {
    result.languages.push(langMatch[1]);
  }
  const moreLangMatch = html.match(/Language[\s\S]*?badge-dd[\s\S]*?\+ (\d+) More/);
  if (moreLangMatch) {
    result.languages.push(`+${moreLangMatch[1]} More`);
  }
  
  // 提取应用大小
  const sizeMatch = html.match(/Size[\s\S]*?badge-dd[\s\S]*?text-container[^>]*>(\d+)<\/span>[\s\S]*?multiline-clamp__text[^>]*>(MB|GB|KB)<\/span>/i);
  if (sizeMatch) {
    const sizeNum = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toUpperCase();
    result.size = sizeNum + ' ' + unit;
    if (unit === 'KB') {
      result.sizeBytes = sizeNum * 1024;
    } else if (unit === 'MB') {
      result.sizeBytes = sizeNum * 1024 * 1024;
    } else if (unit === 'GB') {
      result.sizeBytes = sizeNum * 1024 * 1024 * 1024;
    }
  }

  // 提取开发者链接和ID
  const developerLinkMatch = html.match(/href="([^"]*\/developer\/[^"]+)"[^>]*>[\s\S]*?Developer/i);
  if (developerLinkMatch) {
    result.developerUrl = developerLinkMatch[1].startsWith('http') 
      ? developerLinkMatch[1] 
      : 'https://apps.apple.com' + developerLinkMatch[1];
    
    const devIdMatch = developerLinkMatch[1].match(/\/id(\d+)/);
    if (devIdMatch) {
      result.developerId = devIdMatch[1];
    }
  }

  // 提取应用图标URL
  // 查找200x200或400x400的图标
  const iconMatch = html.match(/https:\/\/is[0-9]-ssl\.mzstatic\.com\/image\/thumb\/[^"]+\/(200x200|400x400)[^"]+\.(webp|jpg|png)/);
  if (iconMatch) {
    result.iconUrl = iconMatch[0];
  } else {
    // 尝试其他格式
    const iconAltMatch = html.match(/srcset="([^"]*\/200x200[^"]+)"|src="([^"]*\/200x200[^"]+)"/);
    if (iconAltMatch) {
      result.iconUrl = iconAltMatch[1] || iconAltMatch[2];
    }
  }

  // 提取截图URLs（从srcset中提取最高质量的URL）
  const screenshotMatches = html.matchAll(/https:\/\/is[0-9]-ssl\.mzstatic\.com\/image\/thumb\/[^"]+apple_app_store_screenshots[^"]+\.(webp|jpg|png)/g);
  const screenshots = [];
  const screenshotSet = new Set();
  
  for (const match of screenshotMatches) {
    // 提取URL（可能包含多个尺寸，取最大的）
    const url = match[0];
    // 从srcset中提取最大尺寸的URL
    const srcsetMatch = html.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^"]*'));
    if (srcsetMatch) {
      // 尝试提取最大尺寸（600x1300或类似）
      const largeMatch = url.match(/(\d+x\d+bb)/);
      if (largeMatch && !screenshotSet.has(url)) {
        screenshotSet.add(url);
        screenshots.push(url.split(' ')[0]); // 只取URL部分，去掉尺寸后缀
      }
    } else if (!screenshotSet.has(url)) {
      screenshotSet.add(url);
      screenshots.push(url.split(' ')[0]);
    }
  }
  
  // 去重并限制数量
  result.screenshotUrls = [...new Set(screenshots)].slice(0, 10);

  // 提取应用描述
  // 查找描述文本（在section中，包含"Download"等关键词）
  const descriptionSectionMatch = html.match(/<section[^>]*id="productDescription"[^>]*>([\s\S]*?)<\/section>/i);
  if (descriptionSectionMatch) {
    const descHtml = descriptionSectionMatch[1];
    // 提取所有段落文本
    const descParagraphs = descHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/g);
    if (descParagraphs) {
      let desc = descParagraphs.map(p => {
        return p
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
      }).filter(t => t && t.length > 10).join('\n\n');
      
      // 移除"more"按钮文本
      desc = desc.replace(/\s*more\s*$/i, '').trim();
      
      if (desc.length > 0) {
        result.description = desc;
        
        // 提取简短描述（前200字符）
        if (desc.length > 200) {
          result.descriptionShort = desc.substring(0, 200) + '...';
        } else {
          result.descriptionShort = desc;
        }
      }
    }
  }
  
  // 如果没找到描述section，尝试查找包含"Download"的文本
  if (!result.description) {
    const downloadMatch = html.match(/Download[^<]+(?:now|and)[^<]+(?:become|master|universe)[^<]*/i);
    if (downloadMatch) {
      let desc = downloadMatch[0]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
      if (desc.length > 20) {
        result.description = desc;
        result.descriptionShort = desc.length > 200 ? desc.substring(0, 200) + '...' : desc;
      }
    }
  }

  // 提取版本信息
  const versionMatch = html.match(/Version[^>]*>([^<]+)<\/div>/i);
  if (versionMatch) {
    result.version = versionMatch[1].trim();
  }

  // 提取更新日期
  const updatedMatch = html.match(/Updated[^>]*>([^<]+)<\/div>/i);
  if (updatedMatch) {
    result.lastUpdated = updatedMatch[1].trim();
  }

  // 提取兼容性信息
  const compatMatch = html.match(/Designed for (iPad|iPhone|Mac|Apple Watch|Apple TV)/i);
  if (compatMatch) {
    result.compatibility = compatMatch[1];
  }

  // 提取商店URL
  if (result.appId) {
    const urlMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i);
    if (urlMatch) {
      result.storeUrl = urlMatch[1];
    } else {
      result.storeUrl = `https://apps.apple.com/app/id${result.appId}`;
    }
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const url = args[0];
  const outputPath = args[1] || path.join(__dirname, '..', 'data', DEFAULT_OUTPUT);
  
  if (!url) {
    console.error('用法: node crawl_appstore.js <store_url|本地.html> [output.json]');
    console.error('示例:');
    console.error('  node crawl_appstore.js "https://apps.apple.com/us/app/screw-world-3d/id1234567890"');
    console.error('  node crawl_appstore.js data/appstore.html');
    process.exit(1);
  }

  const input = url.trim();
  let html;
  let normalizedUrl;

  // 检查是否是本地HTML文件
  if (input.endsWith('.html')) {
    const filePath = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
    if (fs.existsSync(filePath)) {
      normalizedUrl = 'file://' + filePath;
      console.log('从本地文件读取:', filePath);
      html = fs.readFileSync(filePath, 'utf8');
    } else {
      console.error('文件不存在:', filePath);
      process.exit(1);
    }
  } else {
    // 使用 Playwright 爬取
    normalizedUrl = input.startsWith('http') 
      ? input 
      : `https://apps.apple.com/app/id${input}`;
    
    if (!normalizedUrl.includes('apps.apple.com')) {
      console.error('请提供 App Store 应用详情链接、应用ID或本地 .html 文件路径');
      process.exit(1);
    }

    console.log('正在使用 Playwright 打开:', normalizedUrl);
    
    try {
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      
      // 设置用户代理和语言
      await page.setExtraHTTPHeaders({ 
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      // 等待页面加载完成
      await page.goto(normalizedUrl, { 
        waitUntil: 'networkidle', 
        timeout: 30000 
      });
      
      // 等待关键元素加载
      await page.waitForSelector('h1, .shelf', { timeout: 10000 }).catch(() => {});
      
      html = await page.content();
      await browser.close();
    } catch (error) {
      console.error('爬取失败:', error.message);
      process.exit(1);
    }
  }

  try {
    const parsed = parseAppStorePage(html);
    
    const output = {
      url: normalizedUrl,
      crawledAt: new Date().toISOString(),
      app: parsed,
    };

    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    
    console.log('\n✅ 爬取完成！');
    console.log('已写入:', outputPath);
    console.log('\n应用信息:');
    console.log('  应用ID:', parsed.appId || '未找到');
    console.log('  应用名称:', parsed.appName || '未找到');
    console.log('  副标题:', parsed.subtitle || '未找到');
    console.log('  价格:', parsed.price || '未找到');
    console.log('  评分:', parsed.rating ? `${parsed.rating} (${parsed.ratingCount || 0} 个评分)` : '未找到');
    console.log('  开发者:', parsed.developer || '未找到');
    console.log('  分类:', parsed.category || '未找到');
    console.log('  年龄限制:', parsed.ageRating || '未找到');
    console.log('  应用大小:', parsed.size || '未找到');
    console.log('  截图数量:', parsed.screenshotUrls.length);
    console.log('  商店链接:', parsed.storeUrl || normalizedUrl);
  } catch (e) {
    console.error('解析失败:', e);
    console.error(e.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseAppStorePage };
