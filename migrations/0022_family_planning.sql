-- Dining profiles are private; accepted menu snapshots remain the shared source.
ALTER TABLE families ADD COLUMN dining_roster_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE families ADD COLUMN planning_format_version INTEGER NOT NULL DEFAULT 0 CHECK(planning_format_version IN (0,1));
ALTER TABLE family_menu_generations ADD COLUMN legacy_menu_json TEXT;
CREATE TABLE IF NOT EXISTS family_dining_profiles (
  family_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('account','managed')),
  user_id TEXT,
  display_name TEXT NOT NULL,
  profile_json TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(family_id,id),
  CHECK((kind='account' AND user_id IS NOT NULL AND id=user_id) OR
        (kind='managed' AND user_id IS NULL AND substr(id,1,8)='managed:'))
);
CREATE INDEX IF NOT EXISTS idx_family_dining_active ON family_dining_profiles(family_id,active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_dining_account ON family_dining_profiles(family_id,user_id) WHERE kind='account';

INSERT INTO family_dining_profiles(family_id,id,kind,user_id,display_name,profile_json,created_at,updated_at)
SELECT m.family_id,m.user_id,'account',m.user_id,
 COALESCE(NULLIF(trim(m.display_name),''),NULLIF(trim(u.name),''),'Участник'),NULL,m.created_at*1000,COALESCE(m.updated_at,m.created_at)*1000
FROM family_members m JOIN families f ON f.id=m.family_id LEFT JOIN users u ON u.id=m.user_id
WHERE f.is_active=1 AND m.is_active=1 AND m.status='active';
UPDATE families SET dining_roster_version=(SELECT count(*) FROM family_dining_profiles p WHERE p.family_id=families.id);
-- Refuse inconsistent historical capacity instead of dropping data.
CREATE TABLE family_planning_capacity_check(n INTEGER CHECK(n<=5));
INSERT INTO family_planning_capacity_check SELECT count(*) FROM family_dining_profiles WHERE active=1 GROUP BY family_id;
DROP TABLE family_planning_capacity_check;

CREATE TRIGGER family_dining_capacity_insert BEFORE INSERT ON family_dining_profiles WHEN NEW.active=1 BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM family_dining_profiles WHERE family_id=NEW.family_id AND active=1)>=5 THEN RAISE(ABORT,'FAMILY_LIMIT') END;
END;
CREATE TRIGGER family_dining_capacity_update BEFORE UPDATE OF active ON family_dining_profiles WHEN NEW.active=1 AND OLD.active=0 BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM family_dining_profiles WHERE family_id=NEW.family_id AND active=1)>=5 THEN RAISE(ABORT,'FAMILY_LIMIT') END;
END;
CREATE TRIGGER family_dining_identity BEFORE UPDATE ON family_dining_profiles WHEN
 NEW.family_id!=OLD.family_id OR NEW.id!=OLD.id OR NEW.kind!=OLD.kind OR NEW.user_id IS NOT OLD.user_id BEGIN
 SELECT RAISE(ABORT,'BAD_PROFILE');
END;
CREATE TRIGGER family_dining_roster_insert AFTER INSERT ON family_dining_profiles BEGIN
 UPDATE families SET dining_roster_version=dining_roster_version+1 WHERE id=NEW.family_id;
END;
CREATE TRIGGER family_dining_roster_update AFTER UPDATE ON family_dining_profiles BEGIN
 UPDATE families SET dining_roster_version=dining_roster_version+1 WHERE id=NEW.family_id;
END;
CREATE TRIGGER family_dining_roster_delete AFTER DELETE ON family_dining_profiles BEGIN
 UPDATE families SET dining_roster_version=dining_roster_version+1 WHERE id=OLD.family_id;
END;
CREATE TRIGGER family_roster_overflow BEFORE UPDATE OF dining_roster_version ON families WHEN NEW.dining_roster_version>9007199254740991 BEGIN
 SELECT RAISE(ABORT,'VERSION_EXHAUSTED');
END;
CREATE TRIGGER family_members_active_insert BEFORE INSERT ON family_members WHEN NEW.is_active=1 AND NEW.status='active' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM families WHERE id=NEW.family_id AND is_active=1)
 OR EXISTS(SELECT 1 FROM family_members m JOIN families f ON f.id=m.family_id WHERE m.user_id=NEW.user_id AND m.is_active=1 AND m.status='active' AND f.is_active=1)
 THEN RAISE(ABORT,'FAMILY_JOIN_CONFLICT') END;
END;
CREATE TRIGGER family_members_active_update BEFORE UPDATE OF is_active,status ON family_members WHEN NEW.is_active=1 AND NEW.status='active' AND (OLD.is_active!=1 OR OLD.status IS NOT 'active') BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM families WHERE id=NEW.family_id AND is_active=1)
 OR EXISTS(SELECT 1 FROM family_members m JOIN families f ON f.id=m.family_id WHERE m.user_id=NEW.user_id AND m.id!=NEW.id AND m.is_active=1 AND m.status='active' AND f.is_active=1)
 THEN RAISE(ABORT,'FAMILY_JOIN_CONFLICT') END;
END;
CREATE TRIGGER family_members_dining_insert AFTER INSERT ON family_members WHEN NEW.is_active=1 AND NEW.status='active' BEGIN
 INSERT INTO family_dining_profiles(family_id,id,kind,user_id,display_name,profile_json,created_at,updated_at)
 VALUES(NEW.family_id,NEW.user_id,'account',NEW.user_id,COALESCE(NULLIF(trim(NEW.display_name),''),(SELECT NULLIF(trim(name),'') FROM users WHERE id=NEW.user_id),'Участник'),NULL,NEW.created_at*1000,NEW.created_at*1000)
 ON CONFLICT(family_id,id) DO UPDATE SET active=1,version=version+1,updated_at=excluded.updated_at;
END;
CREATE TRIGGER family_members_dining_update AFTER UPDATE OF is_active,status ON family_members WHEN NEW.is_active!=OLD.is_active OR NEW.status IS NOT OLD.status BEGIN
 INSERT INTO family_dining_profiles(family_id,id,kind,user_id,display_name,profile_json,active,created_at,updated_at)
 SELECT NEW.family_id,NEW.user_id,'account',NEW.user_id,COALESCE(NULLIF(trim(NEW.display_name),''),(SELECT NULLIF(trim(name),'') FROM users WHERE id=NEW.user_id),'Участник'),NULL,1,NEW.created_at*1000,COALESCE(NEW.updated_at,NEW.created_at)*1000
 WHERE NEW.is_active=1 AND NEW.status='active'
 ON CONFLICT(family_id,id) DO UPDATE SET active=1,version=version+1,updated_at=excluded.updated_at;
 UPDATE family_dining_profiles SET active=0,version=version+1 WHERE family_id=NEW.family_id AND id=NEW.user_id AND active=1 AND (NEW.is_active!=1 OR NEW.status IS NOT 'active');
END;
CREATE TRIGGER family_members_dining_delete AFTER DELETE ON family_members BEGIN
 UPDATE family_dining_profiles SET active=0,version=version+1 WHERE family_id=OLD.family_id AND id=OLD.user_id AND active=1;
END;
CREATE TRIGGER family_members_identity BEFORE UPDATE OF family_id,user_id ON family_members WHEN NEW.family_id!=OLD.family_id OR NEW.user_id!=OLD.user_id BEGIN
 SELECT RAISE(ABORT,'FAMILY_JOIN_CONFLICT');
END;
CREATE TRIGGER family_planning_plain_insert BEFORE INSERT ON family_menu_generations WHEN
 COALESCE(json_extract(CASE WHEN json_valid(NEW.menu_json) THEN NEW.menu_json ELSE '{}' END,'$.planningV1.schemaVersion'),0)!=1
 AND EXISTS(SELECT 1 FROM families WHERE id=NEW.family_id AND planning_format_version=1) BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_plain_update BEFORE UPDATE OF menu_json ON family_menu_generations WHEN
 COALESCE(json_extract(CASE WHEN json_valid(NEW.menu_json) THEN NEW.menu_json ELSE '{}' END,'$.planningV1.schemaVersion'),0)!=1
 AND (EXISTS(SELECT 1 FROM families WHERE id=NEW.family_id AND planning_format_version=1)
 OR json_extract(CASE WHEN json_valid(OLD.menu_json) THEN OLD.menu_json ELSE '{}' END,'$.planningV1.schemaVersion')=1) BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_date_insert BEFORE INSERT ON family_menu_generations WHEN json_valid(NEW.menu_json) AND json_type(NEW.menu_json,'$.planningV1') IS NOT NULL BEGIN
 SELECT CASE WHEN json_extract(NEW.menu_json,'$.planningV1.schemaVersion') IS NOT 1 OR json_extract(NEW.menu_json,'$.planningV1.date') IS NOT NEW.week_start OR json_extract(NEW.menu_json,'$.weekStart') IS NOT NEW.week_start THEN RAISE(ABORT,'BAD_MENU') END;
END;
CREATE TRIGGER family_planning_date_update BEFORE UPDATE ON family_menu_generations WHEN json_valid(NEW.menu_json) AND json_type(NEW.menu_json,'$.planningV1') IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.family_id!=OLD.family_id OR NEW.week_start!=OLD.week_start OR json_extract(NEW.menu_json,'$.planningV1.schemaVersion') IS NOT 1 OR json_extract(NEW.menu_json,'$.planningV1.date') IS NOT NEW.week_start OR json_extract(NEW.menu_json,'$.weekStart') IS NOT NEW.week_start THEN RAISE(ABORT,'BAD_MENU') END;
END;
CREATE TRIGGER family_planning_archive_update BEFORE UPDATE ON family_menu_generations WHEN
 (OLD.legacy_menu_json IS NOT NULL AND NEW.legacy_menu_json IS NOT OLD.legacy_menu_json)
 OR (OLD.legacy_menu_json IS NULL AND NEW.legacy_menu_json IS NOT NULL AND NEW.legacy_menu_json IS NOT OLD.menu_json) BEGIN
 SELECT RAISE(ABORT,'FAMILY_ARCHIVE_IMMUTABLE');
END;
CREATE TRIGGER family_planning_marker_insert AFTER INSERT ON family_menu_generations WHEN json_valid(NEW.menu_json) AND json_extract(NEW.menu_json,'$.planningV1.schemaVersion')=1 BEGIN
 UPDATE families SET planning_format_version=1 WHERE id=NEW.family_id;
END;
CREATE TRIGGER family_planning_marker_update AFTER UPDATE OF menu_json ON family_menu_generations WHEN json_valid(NEW.menu_json) AND json_extract(NEW.menu_json,'$.planningV1.schemaVersion')=1 BEGIN
 UPDATE families SET planning_format_version=1 WHERE id=NEW.family_id;
END;
CREATE TRIGGER family_planning_marker_persistent BEFORE UPDATE OF planning_format_version ON families WHEN OLD.planning_format_version=1 AND NEW.planning_format_version!=1 BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_delete_guard BEFORE DELETE ON family_menu_generations WHEN
 EXISTS(SELECT 1 FROM families f JOIN users u ON u.id=f.owner_user_id WHERE f.id=OLD.family_id AND f.is_active=1 AND u.is_active=1 AND u.deleted_at IS NULL)
 AND json_valid(OLD.menu_json) AND json_extract(OLD.menu_json,'$.planningV1.schemaVersion')=1 BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_checks_insert BEFORE INSERT ON shopping_checked WHEN
 EXISTS(SELECT 1 FROM family_menu_generations g WHERE (g.family_id=NEW.family_id OR 'family:'||g.family_id=NEW.scope_id) AND g.week_start=NEW.week_start AND json_valid(g.menu_json) AND json_extract(g.menu_json,'$.planningV1.schemaVersion')=1) BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_checks_update BEFORE UPDATE ON shopping_checked WHEN
 EXISTS(SELECT 1 FROM family_menu_generations g WHERE (g.family_id=NEW.family_id OR 'family:'||g.family_id=NEW.scope_id OR g.family_id=OLD.family_id OR 'family:'||g.family_id=OLD.scope_id) AND (g.week_start=NEW.week_start OR g.week_start=OLD.week_start) AND json_valid(g.menu_json) AND json_extract(g.menu_json,'$.planningV1.schemaVersion')=1) BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;

