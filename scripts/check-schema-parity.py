import pathlib
import sqlite3
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]


def apply_sql(files):
    con = sqlite3.connect(":memory:")
    for path in files:
        con.executescript(path.read_text(encoding="utf-8"))
    return con


def tables(con):
    return [
        row[0]
        for row in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]


def columns(con, table):
    return {
        row[1]: {
            "type": row[2],
            "notnull": row[3],
            "default": row[4],
            "pk": row[5],
        }
        for row in con.execute(f"PRAGMA table_info({table})")
    }


def indexes(con, table):
    result = []
    for row in con.execute(f"PRAGMA index_list({table})"):
        name = row[1]
        cols = [col[2] for col in con.execute(f"PRAGMA index_info({name})")]
        result.append((name, row[2], tuple(cols)))
    return sorted(result)


def main():
    migration_files = sorted((ROOT / "migrations").glob("*.sql"))
    if not migration_files:
        print("No migration files found", file=sys.stderr)
        return 1

    migrations_db = apply_sql(migration_files)
    schema_db = apply_sql([ROOT / "db" / "schema.sql"])

    migration_tables = tables(migrations_db)
    schema_tables = tables(schema_db)
    errors = []

    if migration_tables != schema_tables:
        errors.append(
            "Table sets differ:\n"
            f"  migrations={migration_tables}\n"
            f"  schema={schema_tables}"
        )

    for table in sorted(set(migration_tables) | set(schema_tables)):
        migration_columns = columns(migrations_db, table)
        schema_columns = columns(schema_db, table)
        if migration_columns != schema_columns:
            errors.append(
                f"Column definitions differ for {table}:\n"
                f"  migrations={migration_columns}\n"
                f"  schema={schema_columns}"
            )
        migration_indexes = indexes(migrations_db, table)
        schema_indexes = indexes(schema_db, table)
        if migration_indexes != schema_indexes:
            errors.append(
                f"Indexes differ for {table}:\n"
                f"  migrations={migration_indexes}\n"
                f"  schema={schema_indexes}"
            )

    if errors:
        print("\n\n".join(errors), file=sys.stderr)
        return 1

    print(
        f"Schema parity check passed: {len(migration_files)} migration(s), "
        f"{len(migration_tables)} table(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
