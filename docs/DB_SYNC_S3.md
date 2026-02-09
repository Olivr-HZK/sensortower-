# 数据库定期同步（S3 预签名链接）

目标：将 `sensortower_top100.db` 定期上传到私有 S3，并通过短时有效的预签名链接安全分发。

## 1. 准备 S3 与 IAM

- 创建私有 Bucket（禁止公网访问）。
- 创建最小权限的 IAM 用户/角色：
  - `s3:PutObject`、`s3:GetObject`
  - 仅允许指定的 Bucket/Key 前缀

## 2. 配置环境变量

在项目根目录 `.env` 中添加：

```
S3_BUCKET=your-bucket
S3_KEY=sensortower/sensortower_top100.db
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_ENDPOINT_URL=
S3_SSE=AES256
S3_KMS_KEY_ID=
```

> 如果使用 KMS，请设置 `S3_SSE=aws:kms` 并填写 `S3_KMS_KEY_ID`。

## 3. 上传并生成预签名链接

```
python scripts/push_sensortower_db_to_s3.py \
  --db data/sensortower_top100.db \
  --expires 604800 \
  --url-out output/sensortower_db_url.txt
```

输出的 URL 可用于下载脚本：

```
SENSORTOWER_DB_URL=<上一步生成的 URL>
```

## 4. 定时任务示例（cron）

每天凌晨 3 点更新并生成新 URL：

```
0 3 * * * cd /path/to/sensortower && \
  python scripts/push_sensortower_db_to_s3.py \
  --db data/sensortower_top100.db \
  --expires 604800 \
  --url-out output/sensortower_db_url.txt
```

## 5. 下载端

使用现有脚本（从预签名链接下载）：

```
python scripts/fetch_sensortower_db.py --url "<预签名链接>"
```

> 预签名链接最长有效期 7 天。若需要更长的有效期，请缩短更新周期或使用 CloudFront + 签名 URL。
