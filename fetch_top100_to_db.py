import datetime as dt
import os
import sqlite3
from typing import List

import requests


BASE_URL = "https://api.sensortower.com/v1"

# 从环境变量读取 API Token，更安全
API_TOKEN = os.environ.get("SENSORTOWER_API_TOKEN", "").strip()

COUNTRIES = ["US", "JP", "GB", "DE", "IN"]

# 与 market_monitor_v1.6.js 保持一致的配置
CATEGORY_IOS = "7012"
CHART_TYPES_IOS = ["topfreeapplications", "topgrossingapplications"]

CATEGORY_ANDROID = "game_puzzle"
CHART_TYPES_ANDROID = ["topselling_free", "topgrossing"]

DB_PATH = "sensortower_top100.db"

# 起止日期：从你提到的 12.29 到今天
START_DATE_STR = "2025-12-29"
END_DATE_STR = dt.date.today().strftime("%Y-%m-%d")


def daterange_mondays(start_date: dt.date, end_date: dt.date) -> List[dt.date]:
  """从 start_date 到 end_date（含）之间，返回所有周一的日期列表。"""
  # Python 的 weekday：周一=0，周日=6
  days_ahead = (0 - start_date.weekday()) % 7
  first_monday = start_date + dt.timedelta(days=days_ahead)
  cur = first_monday
  mondays: List[dt.date] = []
  while cur <= end_date:
    mondays.append(cur)
    cur = cur + dt.timedelta(days=7)
  return mondays


def call_ranking_api(platform: str, category: str, chart_type: str, country: str, date_str: str) -> List[str]:
  """
  调用 /v1/{platform}/ranking 接口
  platform: "ios" 或 "android"
  返回 ranking 数组（app_id 列表），失败则返回空列表。
  """
  if not API_TOKEN:
    raise RuntimeError("环境变量 SENSORTOWER_API_TOKEN 未配置，请先导出后再运行脚本。")

  url = f"{BASE_URL}/{platform}/ranking"
  params = {
    "category": category,
    "chart_type": chart_type,
    "country": country,
    "date": date_str,
    "auth_token": API_TOKEN,
  }
  resp = requests.get(url, params=params, timeout=30)
  if resp.status_code != 200:
    print(
      f"[WARN] {platform} {country} {chart_type} {date_str} "
      f"API {resp.status_code}: {resp.text[:200]}"
    )
    return []

  data = resp.json()
  ranking = data.get("ranking") or []
  return ranking[:100]


def init_db(conn: sqlite3.Connection) -> None:
  """建表（如果不存在）。"""
  cur = conn.cursor()
  cur.executescript(
    """
    CREATE TABLE IF NOT EXISTS apple_top100 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rank_date DATE NOT NULL,
      country VARCHAR(2) NOT NULL,
      chart_type VARCHAR(32) NOT NULL,
      rank INTEGER NOT NULL,
      app_id VARCHAR(128) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (rank_date, country, chart_type, rank)
    );

    CREATE TABLE IF NOT EXISTS android_top100 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rank_date DATE NOT NULL,
      country VARCHAR(2) NOT NULL,
      chart_type VARCHAR(32) NOT NULL,
      rank INTEGER NOT NULL,
      app_id VARCHAR(128) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (rank_date, country, chart_type, rank)
    );
    """
  )
  conn.commit()


def save_apple_ranking(
  conn: sqlite3.Connection,
  rank_date: dt.date,
  country: str,
  chart_type: str,
  ranking: List[str],
) -> None:
  cur = conn.cursor()
  rows = [
    (rank_date.strftime("%Y-%m-%d"), country, chart_type, idx, app_id)
    for idx, app_id in enumerate(ranking, start=1)
  ]
  cur.executemany(
    """
    INSERT OR IGNORE INTO apple_top100
      (rank_date, country, chart_type, rank, app_id)
    VALUES (?, ?, ?, ?, ?)
    """,
    rows,
  )
  conn.commit()


def save_android_ranking(
  conn: sqlite3.Connection,
  rank_date: dt.date,
  country: str,
  chart_type: str,
  ranking: List[str],
) -> None:
  cur = conn.cursor()
  rows = [
    (rank_date.strftime("%Y-%m-%d"), country, chart_type, idx, app_id)
    for idx, app_id in enumerate(ranking, start=1)
  ]
  cur.executemany(
    """
    INSERT OR IGNORE INTO android_top100
      (rank_date, country, chart_type, rank, app_id)
    VALUES (?, ?, ?, ?, ?)
    """,
    rows,
  )
  conn.commit()


def main() -> None:
  if not API_TOKEN:
    raise RuntimeError("环境变量 SENSORTOWER_API_TOKEN 未配置，请先导出后再运行脚本。")

  start_date = dt.datetime.strptime(START_DATE_STR, "%Y-%m-%d").date()
  end_date = dt.datetime.strptime(END_DATE_STR, "%Y-%m-%d").date()

  mondays = daterange_mondays(start_date, end_date)
  print(f"计划抓取周一日期共 {len(mondays)} 天： {[d.isoformat() for d in mondays]}")

  conn = sqlite3.connect(DB_PATH)
  init_db(conn)

  try:
    for d in mondays:
      date_str = d.strftime("%Y-%m-%d")
      print(f"\n===== 处理日期 {date_str} =====")

      # iOS
      for country in COUNTRIES:
        for chart_type in CHART_TYPES_IOS:
          print(f"[iOS] {country} {chart_type} {date_str}")
          ranking = call_ranking_api("ios", CATEGORY_IOS, chart_type, country, date_str)
          if ranking:
            save_apple_ranking(conn, d, country, chart_type, ranking)

      # Android
      for country in COUNTRIES:
        for chart_type in CHART_TYPES_ANDROID:
          print(f"[Android] {country} {chart_type} {date_str}")
          ranking = call_ranking_api("android", CATEGORY_ANDROID, chart_type, country, date_str)
          if ranking:
            save_android_ranking(conn, d, country, chart_type, ranking)
  finally:
    conn.close()
    print("\n全部完成。")


if __name__ == "__main__":
  main()

