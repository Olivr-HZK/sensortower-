import datetime as dt
import json
import os
import subprocess


DATE = "2026-03-22"

# 定义所有查询组合
QUERIES = [
    # iPhone
    {"platform": "ios", "chart_type": "topfreeapplications",    "category": "6014", "device": "iphone", "category_name": "Games"},
    {"platform": "ios", "chart_type": "topfreeapplications",    "category": "7003", "device": "iphone", "category_name": "Games/Casual"},
    {"platform": "ios", "chart_type": "topfreeapplications",    "category": "7012", "device": "iphone", "category_name": "Games/Puzzle"},
    # iPad
    {"platform": "ios", "chart_type": "topfreeipadapplications", "category": "6014", "device": "ipad",   "category_name": "Games"},
    {"platform": "ios", "chart_type": "topfreeipadapplications", "category": "7003", "device": "ipad",  "category_name": "Games/Casual"},
    {"platform": "ios", "chart_type": "topfreeipadapplications", "category": "7012", "device": "ipad",  "category_name": "Games/Puzzle"},
    # Android
    {"platform": "android", "chart_type": "topselling_free", "category": "game",       "device": "android", "category_name": "Game"},
    {"platform": "android", "chart_type": "topselling_free", "category": "game_casual", "device": "android", "category_name": "Game/Casual"},
    {"platform": "android", "chart_type": "topselling_free", "category": "game_puzzle", "device": "android", "category_name": "Game/Puzzle"},
]

APP_NAME = "Arrow Madness"
APP_ID_IOS = "6756872090"
APP_ID_ANDROID = "com.arrow.madness.games.arrows.escape.puzzle.game"


def call_ranking_api(platform: str, category: str, chart_type: str, country: str = "US", date_str: str = DATE):
    token = os.environ.get("SENSORTOWER_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("环境变量 SENSORTOWER_API_TOKEN 未配置。")

    url = f"https://api.sensortower.com/v1/{platform}/ranking"
    params = f"category={category}&chart_type={chart_type}&country={country}&date={date_str}&auth_token={token}"

    cmd = f'curl -s -G "{url}" --data-urlencode "{params}"'
    # 简化：直接拼接参数
    cmd = [
        "curl", "-s", "-G", url,
        "--data-urlencode", f"category={category}",
        "--data-urlencode", f"chart_type={chart_type}",
        "--data-urlencode", f"country={country}",
        "--data-urlencode", f"date={date_str}",
        "--data-urlencode", f"auth_token={token}",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        print(f"[WARN] curl error: {result.stderr[:200]}")
        return []

    try:
        data = json.loads(result.stdout)
        ranking = data.get("ranking") or []
        return ranking[:100]
    except json.JSONDecodeError:
        print(f"[WARN] JSON parse error: {result.stdout[:200]}")
        return []


def find_app_rank(ranking: list, app_id: str):
    try:
        return ranking.index(app_id) + 1
    except ValueError:
        return None


def main():
    token = os.environ.get("SENSORTOWER_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("环境变量 SENSORTOWER_API_TOKEN 未配置。")

    results = []

    for q in QUERIES:
        label = f"{q['device']}/{q['category_name']}"
        print(f"查询: {label} ...")
        ranking = call_ranking_api(q["platform"], q["category"], q["chart_type"])

        app_id = APP_ID_ANDROID if q["platform"] == "android" else APP_ID_IOS
        rank = find_app_rank(ranking, app_id)

        result = {
            "app_name": APP_NAME,
            "date": DATE,
            "platform": q["platform"],
            "device": q["device"],
            "chart_type": q["chart_type"],
            "category": q["category"],
            "category_name": q["category_name"],
            "app_id": app_id,
            "rank": rank,
            "ranking_list": ranking,
        }
        results.append(result)

        if rank:
            print(f"  -> 排名: #{rank}")
        else:
            print(f"  -> 未上榜")

    # 保存结果
    output_path = "/Users/oliver/guru/sensortower/data/arrow_madness_ranks.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n结果已保存到: {output_path}")


if __name__ == "__main__":
    main()
