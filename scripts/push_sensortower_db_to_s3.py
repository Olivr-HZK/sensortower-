#!/usr/bin/env python3
"""
将本地 sensortower_top100.db 上传到 S3，并生成预签名下载链接。

使用方式（在项目根目录）：
  1）在 .env 中配置上传参数（推荐）：
     - S3_BUCKET=your-bucket
     - S3_KEY=sensortower/sensortower_top100.db
     - AWS_ACCESS_KEY_ID=...
     - AWS_SECRET_ACCESS_KEY=...
     - AWS_REGION=ap-northeast-1
     - S3_ENDPOINT_URL=（可选，兼容 MinIO/OSS 等）
  2）运行脚本：
     - python scripts/push_sensortower_db_to_s3.py --db data/sensortower_top100.db

可选：
  - --expires  预签名 URL 过期时间（秒，最大 604800=7 天）
  - --url-out  将预签名 URL 写入文件
  - --no-print-url  不在控制台输出 URL
  - --sse     服务器端加密（AES256 或 aws:kms）
  - --kms-key-id  KMS Key ID（仅 sse=aws:kms 时生效）
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from dotenv import load_dotenv


MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60


def main() -> None:
    parser = argparse.ArgumentParser(description="上传并生成 S3 预签名下载链接")
    parser.add_argument(
        "--db",
        type=str,
        default="data/sensortower_top100.db",
        help="本地数据库路径（相对仓库根目录）",
    )
    parser.add_argument(
        "--bucket",
        type=str,
        default="",
        help="S3 Bucket（默认读取 S3_BUCKET）",
    )
    parser.add_argument(
        "--key",
        type=str,
        default="",
        help="S3 对象 Key（默认读取 S3_KEY）",
    )
    parser.add_argument(
        "--region",
        type=str,
        default="",
        help="AWS Region（默认读取 AWS_REGION）",
    )
    parser.add_argument(
        "--endpoint-url",
        type=str,
        default="",
        help="自定义 S3 Endpoint（可选）",
    )
    parser.add_argument(
        "--expires",
        type=int,
        default=MAX_PRESIGN_SECONDS,
        help="预签名 URL 过期时间（秒，最大 604800=7 天）",
    )
    parser.add_argument(
        "--url-out",
        type=str,
        default="",
        help="将预签名 URL 写入文件（可选）",
    )
    parser.add_argument(
        "--no-print-url",
        action="store_true",
        help="不在控制台输出预签名 URL",
    )
    parser.add_argument(
        "--sse",
        type=str,
        default="",
        help="服务器端加密方式（AES256 或 aws:kms）",
    )
    parser.add_argument(
        "--kms-key-id",
        type=str,
        default="",
        help="KMS Key ID（仅 sse=aws:kms 时生效）",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    env_path = repo_root / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    db_path = (repo_root / args.db).resolve()
    if not db_path.exists():
        print(f"数据库文件不存在：{db_path}", file=sys.stderr)
        sys.exit(1)

    bucket = args.bucket or os.environ.get("S3_BUCKET", "").strip()
    key = args.key or os.environ.get("S3_KEY", "").strip()
    region = args.region or os.environ.get("AWS_REGION", "").strip()
    endpoint_url = args.endpoint_url or os.environ.get("S3_ENDPOINT_URL", "").strip()
    sse = args.sse or os.environ.get("S3_SSE", "").strip()
    kms_key_id = args.kms_key_id or os.environ.get("S3_KMS_KEY_ID", "").strip()

    if not bucket or not key:
        print("未提供 S3_BUCKET 或 S3_KEY", file=sys.stderr)
        sys.exit(1)

    if args.expires <= 0 or args.expires > MAX_PRESIGN_SECONDS:
        print("expires 必须在 1~604800 秒之间", file=sys.stderr)
        sys.exit(1)

    extra_args: dict[str, str] = {"ContentType": "application/octet-stream"}
    if sse:
        extra_args["ServerSideEncryption"] = sse
        if sse == "aws:kms" and kms_key_id:
            extra_args["SSEKMSKeyId"] = kms_key_id

    try:
        client = boto3.client(
            "s3",
            region_name=region or None,
            endpoint_url=endpoint_url or None,
        )
        client.upload_file(
            Filename=str(db_path),
            Bucket=bucket,
            Key=key,
            ExtraArgs=extra_args,
        )
        presigned_url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=args.expires,
        )
    except NoCredentialsError:
        print("未找到 AWS 凭证，请检查环境变量或本机凭证配置", file=sys.stderr)
        sys.exit(1)
    except ClientError as e:
        print(f"S3 操作失败：{e}", file=sys.stderr)
        sys.exit(1)

    if args.url_out:
        url_out_path = (repo_root / args.url_out).resolve()
        url_out_path.parent.mkdir(parents=True, exist_ok=True)
        url_out_path.write_text(presigned_url, encoding="utf-8")

    if not args.no_print_url:
        print(presigned_url)


if __name__ == "__main__":
    main()
