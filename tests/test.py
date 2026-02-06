import sqlite3


def get_tables(conn):
    """获取数据库中所有表名"""
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table';"
    )
    return {row[0] for row in cursor.fetchall()}


def get_columns(conn, table_name):
    """获取某个表的列名"""
    cursor = conn.execute(f"PRAGMA table_info('{table_name}')")
    # table_info返回字段结构：
    # (cid, name, type, notnull, dflt_value, pk)
    return [row[1] for row in cursor.fetchall()]


def compare_databases(db1_path, db2_path):
    conn1 = sqlite3.connect(db1_path)
    conn2 = sqlite3.connect(db2_path)

    tables1 = get_tables(conn1)
    tables2 = get_tables(conn2)

    print("===== 表对比 =====")

    only_in_db1 = tables1 - tables2
    only_in_db2 = tables2 - tables1
    common_tables = tables1 & tables2

    if only_in_db1:
        print("仅存在于 DB1 的表:", only_in_db1)

    if only_in_db2:
        print("仅存在于 DB2 的表:", only_in_db2)

    print("\n===== 列对比 =====")

    for table in common_tables:
        cols1 = set(get_columns(conn1, table))
        cols2 = set(get_columns(conn2, table))

        if cols1 != cols2:
            print(f"\n表 {table} 列不一致:")

            diff1 = cols1 - cols2
            diff2 = cols2 - cols1

            if diff1:
                print("  DB1 独有列:", diff1)

            if diff2:
                print("  DB2 独有列:", diff2)

    conn1.close()
    conn2.close()


# 示例调用
compare_databases("my_week.db", "sensortower_top100.db")
