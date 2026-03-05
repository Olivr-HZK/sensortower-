# 网络连接超时问题修复

## 🔍 问题描述

错误信息：`获取应用名称失败: connect ETIMEDOUT 174.37.54.20:443`

### 问题原因

1. **网络连接超时**：连接到 `api.sensortower.com` (174.37.54.20:443) 超时
2. **没有重试机制**：原代码遇到网络错误就直接失败，没有重试
3. **超时时间未设置**：Node.js 默认超时时间可能不够
4. **网络不稳定**：可能是临时网络问题或 API 服务器负载高

## ✅ 修复方案

### 1. 添加重试机制

- 自动重试 3 次
- 每次重试间隔递增（1秒、2秒、3秒）
- 只对特定错误重试（ETIMEDOUT、ECONNRESET、ENOTFOUND）

### 2. 设置超时时间

- 设置 30 秒超时时间
- 超时后自动重试

### 3. 改进错误处理

- 即使某个批次失败，也继续处理下一批
- 避免因单个批次失败而中断整个流程
- 更详细的错误日志

## 📝 修改内容

### `fetchJson` 函数增强

```javascript
function fetchJson(url, retries = 3, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const attemptFetch = (attempt) => {
      const req = https.get(url, {
        timeout: timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 ...'
        }
      }, (res) => {
        // ... 处理响应
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempt < retries) {
          console.log(`  请求超时，重试 ${attempt + 1}/${retries}...`);
          setTimeout(() => attemptFetch(attempt + 1), 1000 * attempt);
        } else {
          reject(new Error(`连接超时（已重试 ${retries} 次）`));
        }
      });

      req.on('error', (e) => {
        if (attempt < retries && (e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET')) {
          console.log(`  网络错误 ${e.code}，重试 ${attempt + 1}/${retries}...`);
          setTimeout(() => attemptFetch(attempt + 1), 1000 * attempt);
        } else {
          reject(e);
        }
      });
    };

    attemptFetch(1);
  });
}
```

### `fetchAppNames` 函数改进

```javascript
try {
  let data = await fetchJson(url, 3, 30000); // 重试3次，超时30秒
  // ... 处理数据
} catch (e) {
  console.error(`  获取应用名称失败 (批次 ${i + 1}-${i + batch.length}):`, e.message);
  // 即使失败也继续处理下一批，避免中断整个流程
}
```

## 🔧 其他解决方案

### 方案 1：检查网络连接

```bash
# 测试 API 连接
curl -I https://api.sensortower.com/v1/ios/category/category_history

# 检查 DNS 解析
nslookup api.sensortower.com

# 检查防火墙/代理设置
```

### 方案 2：使用代理（如果需要）

如果在中国大陆，可能需要配置代理：

```bash
# 设置代理环境变量
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080

# 或在代码中配置
```

### 方案 3：增加延迟

如果 API 有速率限制，可以增加批次之间的延迟：

```javascript
const DELAY_MS = 400; // 增加到 800 或 1000
```

### 方案 4：使用中国区 API（如果可用）

检查是否可以使用中国区 API 获取应用名称：

```javascript
// 尝试使用中国区 API
const BASE_URL_NAMES = 'https://api.sensortower-china.com/v1';
```

## 📊 错误类型说明

### ETIMEDOUT
- **含义**：连接超时
- **原因**：网络延迟高、服务器响应慢、防火墙阻塞
- **解决**：重试、增加超时时间、检查网络

### ECONNRESET
- **含义**：连接被重置
- **原因**：服务器主动断开连接、网络不稳定
- **解决**：重试、检查服务器状态

### ENOTFOUND
- **含义**：DNS 解析失败
- **原因**：DNS 服务器问题、域名不存在
- **解决**：检查 DNS 设置、使用 IP 地址

## 🚀 使用建议

1. **首次运行**：如果遇到超时，脚本会自动重试，耐心等待
2. **批量处理**：即使部分批次失败，脚本也会继续处理其他批次
3. **网络环境**：确保网络连接稳定，如果经常超时，考虑使用代理
4. **监控日志**：关注控制台输出，了解哪些批次成功/失败

## 📝 日志示例

### 正常情况
```
[iOS] 需拉取应用名 30 个（走 /category/category_history）
[iOS] 应用名拉取完成，共 30 个
```

### 有重试的情况
```
[iOS] 需拉取应用名 30 个（走 /category/category_history）
  请求超时，重试 2/3...
  网络错误 ETIMEDOUT，重试 2/3...
[iOS] 应用名拉取完成，共 28 个
```

### 最终失败的情况
```
[iOS] 需拉取应用名 30 个（走 /category/category_history）
  请求超时，重试 2/3...
  请求超时，重试 3/3...
  获取应用名称失败 (批次 1-30): 连接超时（已重试 3 次）
[iOS] 应用名拉取完成，共 0 个
```

## ⚠️ 注意事项

1. **部分失败不影响整体**：即使某些应用名称获取失败，脚本也会继续运行
2. **缓存机制**：已获取的应用名称会缓存在 `app_name_cache` 表中，下次不需要重新获取
3. **手动补全**：如果某些应用名称缺失，可以运行 `refill_app_names.js` 手动补全
