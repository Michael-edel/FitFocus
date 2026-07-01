import pathlib
import re
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
USER_REF_COLUMNS = {
    "user_id",
    "owner_user_id",
    "created_by_user_id",
    "used_by_user_id",
    "admin_user_id",
    "target_user_id",
    "assigned_admin_user_id",
    "author_user_id",
}

EXPECTED_USER_RELATED_TABLES = {
    "users",
    "subscriptions",
    "usage_daily",
    "user_profiles",
    "user_kv",
    "sessions",
    "push_subscriptions",
    "user_roles",
    "ai_events",
    "user_cost_daily",
    "invite_redemptions",
    "families",
    "family_members",
    "family_menus",
    "recipes",
    "family_invites",
    "weekly_menus",
    "weekly_menu_portions",
    "weekly_menu_items",
    "shopping_checked",
    "admin_events",
    "admin_sessions",
    "support_feedback",
    "support_feedback_messages",
    "ai_rate_limits",
    "user_achievements",
    "wearable_connections",
}

# Some tables are related through family_id/scope_id rather than a direct user-id column.
INDIRECT_USER_RELATED_TABLES = {
    "family_menus",
    "shopping_checked",
}


def schema_user_related_tables():
    schema = (ROOT / "db" / "schema.sql").read_text(encoding="utf-8")
    current_table = None
    tables = set()
    for raw_line in schema.splitlines():
        line = raw_line.strip()
        match = re.match(r"CREATE TABLE IF NOT EXISTS\s+(\w+)", line, re.I)
        if match:
            current_table = match.group(1)
            if current_table == "users":
                tables.add(current_table)
            continue
        if current_table and line.startswith(");"):
            current_table = None
            continue
        if not current_table:
            continue
        column_match = re.match(r"([A-Za-z_]\w*)\s+", line)
        if column_match and column_match.group(1) in USER_REF_COLUMNS:
            tables.add(current_table)
    return tables | INDIRECT_USER_RELATED_TABLES


def ensure_tables_are_classified():
    found = schema_user_related_tables()
    missing = found - EXPECTED_USER_RELATED_TABLES
    stale = EXPECTED_USER_RELATED_TABLES - found
    errors = []
    if missing:
        errors.append(f"Unclassified user-related table(s): {sorted(missing)}")
    if stale:
        errors.append(f"Privacy coverage policy references missing table(s): {sorted(stale)}")
    return errors


def ensure_source_mentions(label, path, required_tables):
    text = path.read_text(encoding="utf-8")
    missing = sorted(table for table in required_tables if table not in text)
    if missing:
        return [f"{label} does not mention table(s): {missing}"]
    return []


def main():
    errors = []
    errors.extend(ensure_tables_are_classified())
    errors.extend(
        ensure_source_mentions(
            "account_delete.ts",
            ROOT / "functions" / "api" / "_lib" / "account_delete.ts",
            EXPECTED_USER_RELATED_TABLES,
        )
    )
    errors.extend(
        ensure_source_mentions(
            "export.ts",
            ROOT / "functions" / "api" / "export.ts",
            EXPECTED_USER_RELATED_TABLES,
        )
    )

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    print(f"Privacy coverage check passed: {len(EXPECTED_USER_RELATED_TABLES)} user-related table(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
