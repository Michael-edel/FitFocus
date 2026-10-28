-- Read-only, aggregate preflight. Run against the explicitly verified database.
-- Missing tables/ledger or nonzero anomaly counts mean STOP, not automatic repair.
SELECT name FROM d1_migrations ORDER BY id;
SELECT type,name FROM sqlite_master
WHERE name IN ('family_dining_profiles','idx_family_dining_active','idx_family_dining_account')
   OR name LIKE 'family_planning_%' OR name LIKE 'family_dining_%'
ORDER BY type,name;
SELECT count(*) AS active_families_over_five FROM (
 SELECT m.family_id FROM family_members m JOIN families f ON f.id=m.family_id
 WHERE f.is_active=1 AND m.is_active=1 AND m.status='active'
 GROUP BY m.family_id HAVING count(*)>5
);
SELECT count(*) AS accounts_in_multiple_active_families FROM (
 SELECT m.user_id FROM family_members m JOIN families f ON f.id=m.family_id
 WHERE f.is_active=1 AND m.is_active=1 AND m.status='active'
 GROUP BY m.user_id HAVING count(DISTINCT m.family_id)>1
);
SELECT count(*) AS active_families_without_owner_membership FROM families f
WHERE f.is_active=1 AND NOT EXISTS (
 SELECT 1 FROM family_members m WHERE m.family_id=f.id AND m.user_id=f.owner_user_id
 AND m.is_active=1 AND m.status='active'
);
SELECT count(*) AS active_orphan_memberships FROM family_members m
JOIN families f ON f.id=m.family_id LEFT JOIN users u ON u.id=m.user_id
WHERE f.is_active=1 AND m.is_active=1 AND m.status='active' AND u.id IS NULL;
SELECT count(*) AS invalid_seed_timestamps FROM family_members m
JOIN families f ON f.id=m.family_id
WHERE f.is_active=1 AND m.is_active=1 AND m.status='active'
 AND (typeof(m.created_at)!='integer' OR m.created_at<0 OR m.created_at>9007199254740
 OR (m.updated_at IS NOT NULL AND
 (typeof(m.updated_at)!='integer' OR m.updated_at<0 OR m.updated_at>9007199254740)));
SELECT count(*) AS expected_private_account_profiles FROM family_members m
JOIN families f ON f.id=m.family_id
WHERE f.is_active=1 AND m.is_active=1 AND m.status='active';
