-- AlterTable
ALTER TABLE "Column" ALTER COLUMN "position" SET DEFAULT 'a0',
ALTER COLUMN "position" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "position" SET DEFAULT 'a0',
ALTER COLUMN "position" SET DATA TYPE TEXT;

-- DataPolish: re-key existing positions to lexicographic indices in row order.
-- Without this, rows created under the old Int schema (position = 0) cast
-- to the string "0", which sorts AFTER every 'a0'-style index — so old
-- rows would bunch at the end of every list. The CTEs below rewrite each
-- row's position to 'a1', 'a2', 'a3', ... in its scope's natural order,
-- partitioned by the immediate parent (boardId for Column, columnId for
-- Task). New writes go through server/src/common/utils/lexoPosition.ts
-- and produce a0, a1, ... starting from a0 — see Phase 4 Plan §1.2.
WITH ordered_columns AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "boardId" ORDER BY "position", "id") AS rn
  FROM "Column"
)
UPDATE "Column" c
SET "position" = 'a' || oc.rn::text
FROM ordered_columns oc
WHERE c.id = oc.id;

WITH ordered_tasks AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "columnId" ORDER BY "position", "id") AS rn
  FROM "Task"
)
UPDATE "Task" t
SET "position" = 'a' || ot.rn::text
FROM ordered_tasks ot
WHERE t.id = ot.id;
