import sqlite3
from pathlib import Path

import requests


# ========== 基础配置 ==========

# 项目根目录（假设本文件放在 project_root/scripts/ 下）
BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "data" / "sensortower_top100.db"

# 飞书应用凭证（在飞书开放平台复制后填入）
FEISHU_APP_ID = "YOUR_FEISHU_APP_ID"
FEISHU_APP_SECRET = "YOUR_FEISHU_APP_SECRET"

# 每个 SQLite 表对应一个多维表格表
# 约定：多维表格里的字段名和 SQLite 列名保持一致，这样就不用手动一个个映射
TABLE_CONFIG = {
    # iOS 榜单
    "apple_top100": {
        "date_column": "rank_date",  # 用来判断“最新一批”的日期列
        "bitable_app_token": "BITABLE_APP_TOKEN_FOR_APPLE_TOP100",
        "bitable_table_id": "BITABLE_TABLE_ID_FOR_APPLE_TOP100",
    },
    # Android 榜单
    "android_top100": {
        "date_column": "rank_date",
        "bitable_app_token": "BITABLE_APP_TOKEN_FOR_ANDROID_TOP100",
        "bitable_table_id": "BITABLE_TABLE_ID_FOR_ANDROID_TOP100",
    },
    # 排名变化汇总
    "rank_changes": {
        "date_column": "rank_date_current",
        "bitable_app_token": "BITABLE_APP_TOKEN_FOR_RANK_CHANGES",
        "bitable_table_id": "BITABLE_TABLE_ID_FOR_RANK_CHANGES",
    },
    # 如果之后还想同步其它表，仿照上面再加配置即可
}


# ========== 飞书相关函数 ==========

def get_tenant_access_token() -> str:
    """
    使用内部应用凭证换取 tenant_access_token。
    """
    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    payload = {"app_id": FEISHU_APP_ID, "app_secret": FEISHU_APP_SECRET}
    resp = requests.post(url, json=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"获取 tenant_access_token 失败: {data}")
    return data["tenant_access_token"]


def write_records_to_bitable(
    tenant_access_token: str,
    app_token: str,
    table_id: str,
    records: list[dict],
) -> None:
    """
    批量写入记录到指定多维表格。

    约定：records 的每个 dict 的 key 就是多维表格里的字段名。
    """
    if not records:
        return

    url = (
        f"https://open.feishu.cn/open-apis/bitable/v1/apps/"
        f"{app_token}/tables/{table_id}/records/batch_create"
    )
    headers = {
        "Authorization": f"Bearer {tenant_access_token}",
        "Content-Type": "application/json; charset=utf-8",
    }

    batch_size = 500  # 官方单次最多 500 条，这里安全起见按 500 分批
    total = len(records)
    for start in range(0, total, batch_size):
        batch = records[start : start + batch_size]
        payload = {"records": [{"fields": r} for r in batch]}
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"写入多维表格失败: {data}")

        print(f"  已写入 {min(start + len(batch), total)}/{total} 条")


# ========== SQLite 相关函数 ==========

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    """
    通过 PRAGMA table_info 动态获取列名，避免硬编码。
    """
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table});")
    rows = cur.fetchall()
    return [r["name"] for r in rows]


def fetch_latest_rows(
    conn: sqlite3.Connection,
    table: str,
    date_column: str,
) -> list[sqlite3.Row]:
    """
    只取“最新一批”的数据：
    - 通过 date_column 找出此表中最大的日期
    - 再把该日期下的所有行全部取出来
    """
    cur = conn.cursor()

    # 找到该表中最新的日期值
    cur.execute(f"SELECT MAX({date_column}) AS max_date FROM {table}")
    row = cur.fetchone()
    max_date = row["max_date"]
    if max_date is None:
        return []

    # 取该日期对应的所有行
    cur.execute(
        f"SELECT * FROM {table} WHERE {date_column} = ?",
        (max_date,),
    )
    rows = cur.fetchall()
    print(f"{table}: 最新 {date_column} = {max_date}，共有 {len(rows)} 条")
    return rows


# ========== 主流程 ==========

def export_one_table(
    tenant_access_token: str,
    conn: sqlite3.Connection,
    table: str,
    config: dict,
) -> None:
    date_column = config["date_column"]
    app_token = config["bitable_app_token"]
    table_id = config["bitable_table_id"]

    print(f"\n开始同步表 {table} -> 多维表格 {table_id}")

    rows = fetch_latest_rows(conn, table, date_column)
    if not rows:
        print(f"{table}: 没有数据可同步，跳过")
        return

    columns = get_columns(conn, table)

    # 把 SQLite 的一行转成 {列名: 值} 字典，列名和 Bitable 字段名相同
    records: list[dict] = []
    for row in rows:
        record = {}
        for col in columns:
            record[col] = row[col]
        records.append(record)

    write_records_to_bitable(
        tenant_access_token=tenant_access_token,
        app_token=app_token,
        table_id=table_id,
        records=records,
    )


def main() -> None:
    # 1. 获取飞书 tenant_access_token
    tenant_access_token = get_tenant_access_token()

    # 2. 连接 SQLite
    conn = get_connection()
    try:
        # 3. 遍历配置好的每个表，只同步“最新一批”数据
        for table, cfg in TABLE_CONFIG.items():
            export_one_table(tenant_access_token, conn, table, cfg)
    finally:
        conn.close()

    print("\n所有表同步完成（每个表仅最新一批数据）。")


if __name__ == "__main__":
    main()

