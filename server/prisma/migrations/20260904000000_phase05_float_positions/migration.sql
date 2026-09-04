-- Phase 5: switch Column.position and Task.position from String to Float.
--
-- Replaces the Phase 4 base-62 lexo position with a simple Float midpoint
-- scheme (MAX + 1000 for append, (prev + next) / 2 for between). Simpler
-- code, no helper module, no re-pack fallback. KNOWN LIMITATION: Float
-- precision floor is hit after ~50 midpoint inserts in one gap — beyond
-- that, drags between two tasks land on the wrong neighbor. The PATCH
-- /reorder endpoint re-keys to fresh 1000-step positions, which resets
-- the precision budget.
--
-- Step 1: re-key every existing row to a clean 1000-step numeric string
-- ("1000", "2000", ...) in the row's natural order. This preserves the
-- existing order without trying to cast lexo strings to numbers (which
-- would fail for the "a0V"-style values).
--
-- Step 2: drop the string default, change the column type to
-- double precision (the numeric-string values cast cleanly), then
-- re-add the new Float default of 1000.

-- DataPolish: re-key existing string positions to numeric strings in
-- row order, partitioned by the immediate parent.
WITH ordered_columns AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "boardId" ORDER BY "id") AS rn
  FROM "Column"
)
UPDATE "Column" c
SET "position" = (oc.rn * 1000)::text
FROM ordered_columns oc
WHERE c.id = oc.id;

WITH ordered_tasks AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "columnId" ORDER BY "id") AS rn
  FROM "Task"
)
UPDATE "Task" t
SET "position" = (ot.rn * 1000)::text
FROM ordered_tasks ot
WHERE t.id = ot.id;

-- AlterTable: drop old string default, change type, set new Float default.
ALTER TABLE "Column" ALTER COLUMN "position" DROP DEFAULT;
ALTER TABLE "Column" ALTER COLUMN "position" SET DATA TYPE DOUBLE PRECISION USING ("position"::text::double precision);
ALTER TABLE "Column" ALTER COLUMN "position" SET DEFAULT 1000;

ALTER TABLE "Task" ALTER COLUMN "position" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "position" SET DATA TYPE DOUBLE PRECISION USING ("position"::text::double precision);
ALTER TABLE "Task" ALTER COLUMN "position" SET DEFAULT 1000;
