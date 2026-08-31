# NOTE: not currently imported by anything. main.py registered these
# listeners while Part 10-15 measurements were being taken, and that
# import was removed along with the /debug endpoints once the numbers
# were recorded in PERFORMANCE.md. Kept because re-enabling it is one
# import line, and PERFORMANCE.md documents the technique.

# backend/app/services/query_debug.py
from sqlalchemy import event
from sqlalchemy.engine import Engine
import time

query_count = {"count": 0, "total_time": 0.0}

@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault("query_start_time", []).append(time.time())
    query_count["count"] += 1

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    total = time.time() - conn.info["query_start_time"].pop(-1)
    query_count["total_time"] += total