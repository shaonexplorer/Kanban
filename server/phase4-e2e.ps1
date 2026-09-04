# Phase 4 end-to-end manual scenario.
# Exercises the ordering/move layer added on top of Phase 3's
# content API. Validates that:
#  - Columns are ordered by `position` (Float) on the board.
#  - Tasks are ordered by `position` within a column.
#  - POST /api/columns/:columnId/tasks/:taskId/move moves tasks
#    within a column AND across columns, with the Float midpoint
#    semantics documented in the Plan.
#  - POST /api/columns/:id/move reorders a column on its board.
#  - PATCH /api/boards/:boardId/columns/reorder (Phase 3) re-keys
#    to fresh 1000-step Floats.
#  - Cross-board moves are rejected (403).
#  - Authorization is enforced on every move (403 for non-members).
#
# Phase 5 simplification: positions are Floats (MAX + 1000 for
# append, (prev + next) / 2 for between). No re-pack fallback — the
# Float precision floor is documented in
# server/src/common/utils/floatPosition.ts as a known limitation.
#
# Usage: powershell -ExecutionPolicy Bypass -File phase4-e2e.ps1
# Assumes the dev server is running on http://localhost:4000.

$ErrorActionPreference = "Continue"
$Base = "http://localhost:4000"

# Use a unique suffix per run so the script is idempotent.
$Suffix = ([guid]::NewGuid().ToString("N")).Substring(0, 8)
$U1    = "u1-p4-$Suffix@example.com"
$U2    = "u2-p4-$Suffix@example.com"
$U3    = "u3-p4-$Suffix@example.com"
$Pw    = "password123"

# ---------------------------------------------------------------------------
# Tiny test helpers
# ---------------------------------------------------------------------------
$Script:Pass = 0
$Script:Fail = 0
$Script:Log  = @()

function Record($name, $ok, $detail = "") {
  if ($ok) {
    $Script:Pass++
    $tag = "PASS"
  } else {
    $Script:Fail++
    $tag = "FAIL"
  }
  $line = "[$tag] $name"
  if ($detail) { $line = "$line - $detail" }
  $Script:Log += $line
  Write-Host $line
}

# HTTP helper. Returns a hashtable with Status, Body, Raw.
# Non-2xx responses are NOT thrown - we want to inspect the status code.
function Call($method, $path, $token = $null, $body = $null) {
  $headers = @{ "Content-Type" = "application/json" }
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  $params = @{
    Method  = $method
    Uri     = "$Base$path"
    Headers = $headers
  }
  if ($body) { $params.Body = ($body | ConvertTo-Json -Depth 5) }

  $resp  = $null
  $raw   = ""
  $code  = 0
  try {
    $r = Invoke-WebRequest @params -UseBasicParsing -ErrorAction Stop
    $raw  = $r.Content
    $code = [int]$r.StatusCode
  } catch {
    # Invoke-WebRequest throws on non-2xx; the response object is on
    # $_.Exception.Response. Read the status and body from there.
    $exResp = $_.Exception.Response
    if ($exResp) {
      $code = [int]$exResp.StatusCode
      $stream = $exResp.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $raw = $reader.ReadToEnd()
        $reader.Close()
      }
    } else {
      $code = 0
      $raw  = $_.Exception.Message
    }
  }

  $parsed = $null
  if ($raw) {
    try { $parsed = $raw | ConvertFrom-Json } catch { $parsed = $null }
  }
  return @{ Status = $code; Body = $parsed; Raw = $raw }
}

# ---------------------------------------------------------------------------
# Step 1 - register the three users
# ---------------------------------------------------------------------------
$r1 = Call POST "/api/auth/register" $null @{ email = $U1; password = $Pw }
Record "Register u1 (201)" ($r1.Status -eq 201) ("status=$($r1.Status)")
$U1Id = $r1.Body.id

$r2 = Call POST "/api/auth/register" $null @{ email = $U2; password = $Pw }
Record "Register u2 (201)" ($r2.Status -eq 201) ("status=$($r2.Status)")
$U2Id = $r2.Body.id

$r3 = Call POST "/api/auth/register" $null @{ email = $U3; password = $Pw }
Record "Register u3 (201)" ($r3.Status -eq 201) ("status=$($r3.Status)")
$U3Id = $r3.Body.id

# Log in to get fresh JWTs.
$l1 = Call POST "/api/auth/login" $null @{ email = $U1; password = $Pw }
Record "Login u1 (200)" (($l1.Status -eq 200) -and $l1.Body.token)
$T1 = $l1.Body.token

$l2 = Call POST "/api/auth/login" $null @{ email = $U2; password = $Pw }
Record "Login u2 (200)" (($l2.Status -eq 200) -and $l2.Body.token)
$T2 = $l2.Body.token

$l3 = Call POST "/api/auth/login" $null @{ email = $U3; password = $Pw }
Record "Login u3 (200)" (($l3.Status -eq 200) -and $l3.Body.token)
$T3 = $l3.Body.token

# ---------------------------------------------------------------------------
# Step 2 - u1 creates B1, invites + accepts u2 as a member
# ---------------------------------------------------------------------------
$cb = Call POST "/api/boards" $T1 @{ title = "P4 Board" }
Record "Create B1 (201)" ($cb.Status -eq 201) ("status=$($cb.Status)")
$B1 = $cb.Body.id

$inv = Call POST "/api/boards/$B1/members" $T1 @{ email = $U2 }
Record "Invite u2 to B1 (201)" ($inv.Status -eq 201) ("status=$($inv.Status)")
$I1 = $inv.Body.id

$acc = Call POST "/api/board-invitations/$I1/accept" $T2
Record "u2 accepts invite (200)" (($acc.Status -eq 200) -and ($acc.Body.status -eq "ACCEPTED"))

# ---------------------------------------------------------------------------
# Step 3 - u1 creates a SECOND board B2 for cross-board tests
# ---------------------------------------------------------------------------
$cb2 = Call POST "/api/boards" $T1 @{ title = "P4 Board 2" }
Record "Create B2 (201)" ($cb2.Status -eq 201) ("status=$($cb2.Status)")
$B2 = $cb2.Body.id

# ---------------------------------------------------------------------------
# Step 4 - create three columns C1, C2, C3 on B1
# ---------------------------------------------------------------------------
$cc1 = Call POST "/api/boards/$B1/columns" $T1 @{ title = "C1" }
Record "Create C1 (201)" ($cc1.Status -eq 201) ("status=$($cc1.Status) body=$($cc1.Raw)")
$C1 = $cc1.Body.id

$cc2 = Call POST "/api/boards/$B1/columns" $T1 @{ title = "C2" }
Record "Create C2 (201)" ($cc2.Status -eq 201) ("status=$($cc2.Status)")
$C2 = $cc2.Body.id

$cc3 = Call POST "/api/boards/$B1/columns" $T1 @{ title = "C3" }
Record "Create C3 (201)" ($cc3.Status -eq 201) ("status=$($cc3.Status)")
$C3 = $cc3.Body.id

# Create one column on B2 (used for cross-board move rejection).
$cb2c1 = Call POST "/api/boards/$B2/columns" $T1 @{ title = "B2C1" }
Record "Create B2C1 (201)" ($cb2c1.Status -eq 201) ("status=$($cb2c1.Status)")
$B2C1 = $cb2c1.Body.id

# ---------------------------------------------------------------------------
# Step 5 - create three tasks TK1, TK2, TK3 in C1
# ---------------------------------------------------------------------------
$tk1 = Call POST "/api/columns/$C1/tasks" $T1 @{ title = "TK1"; description = "first" }
Record "Create TK1 (201)" ($tk1.Status -eq 201) ("status=$($tk1.Status) body=$($tk1.Raw)")
$TK1 = $tk1.Body.id

$tk2 = Call POST "/api/columns/$C1/tasks" $T1 @{ title = "TK2" }
Record "Create TK2 (201)" ($tk2.Status -eq 201) ("status=$($tk2.Status)")
$TK2 = $tk2.Body.id

$tk3 = Call POST "/api/columns/$C1/tasks" $T1 @{ title = "TK3" }
Record "Create TK3 (201)" ($tk3.Status -eq 201) ("status=$($tk3.Status)")
$TK3 = $tk3.Body.id

# Create one task in C2 (used for cross-column move tests).
$tk4 = Call POST "/api/columns/$C2/tasks" $T1 @{ title = "TK4" }
Record "Create TK4 in C2 (201)" ($tk4.Status -eq 201) ("status=$($tk4.Status)")
$TK4 = $tk4.Body.id

# ---------------------------------------------------------------------------
# Step 6 - VAL-4.1.3: board detail returns tasks/columns ordered by position
# ---------------------------------------------------------------------------
$bd = Call GET "/api/boards/$B1" $T1
$colsOrdered = $bd.Body.columns | ForEach-Object { $_.id }
Record "VAL-4.5.3 GET /boards/:id columns ordered by position asc" `
  (($bd.Status -eq 200) -and ($colsOrdered[0] -eq $C1) -and ($colsOrdered[1] -eq $C2) -and ($colsOrdered[2] -eq $C3)) `
  ("got=$($colsOrdered -join ',')")

$c1TasksOrdered = ($bd.Body.columns | Where-Object { $_.id -eq $C1 })[0].tasks | ForEach-Object { $_.id }
Record "VAL-4.5.3 GET /boards/:id tasks ordered by position asc" `
  (($c1TasksOrdered[0] -eq $TK1) -and ($c1TasksOrdered[1] -eq $TK2) -and ($c1TasksOrdered[2] -eq $TK3)) `
  ("got=$($c1TasksOrdered -join ',')")

# ---------------------------------------------------------------------------
# Step 7 - VAL-4.3.1: same-column reorder (move TK1 to index 2)
# ---------------------------------------------------------------------------
$mv1 = Call POST "/api/columns/$C1/tasks/$TK1/move" $T1 @{ toColumnId = $C1; toIndex = 2 }
Record "VAL-4.3.1 same-column move 200" ($mv1.Status -eq 200) ("status=$($mv1.Status)")
Record "VAL-4.3.1 returned columnId is C1" ($mv1.Body.columnId -eq $C1) ("got=$($mv1.Body.columnId)")

$c1After = Call GET "/api/columns/$C1/tasks" $T1
$idsAfter = $c1After.Body | ForEach-Object { $_.id }
Record "VAL-4.3.1 ordering is [TK2, TK3, TK1]" `
  (($c1After.Status -eq 200) -and ($idsAfter[0] -eq $TK2) -and ($idsAfter[1] -eq $TK3) -and ($idsAfter[2] -eq $TK1)) `
  ("got=$($idsAfter -join ',')")

# Capture the moved TK1's new position for the between-bound assertion.
# After moving TK1 to index 2, the new order is [TK2, TK3, TK1] so the
# new TK1 position is strictly greater than BOTH TK2 and TK3.
$tk1NewPos = ($c1After.Body | Where-Object { $_.id -eq $TK1 })[0].position
$tk2Pos    = ($c1After.Body | Where-Object { $_.id -eq $TK2 })[0].position
$tk3Pos    = ($c1After.Body | Where-Object { $_.id -eq $TK3 })[0].position

Record "VAL-4.3.4 new position is strictly greater than both neighbours (TK2 < TK3 < TK1)" `
  (($tk2Pos -lt $tk3Pos) -and ($tk3Pos -lt $tk1NewPos)) `
  ("TK2=$tk2Pos TK3=$tk3Pos TK1=$tk1NewPos")

# ---------------------------------------------------------------------------
# Step 8 - VAL-4.3.2: cross-column move (TK1 from C1 to C2 at index 0)
# ---------------------------------------------------------------------------
$mv2 = Call POST "/api/columns/$C1/tasks/$TK1/move" $T1 @{ toColumnId = $C2; toIndex = 0 }
Record "VAL-4.3.2 cross-column move 200" ($mv2.Status -eq 200) ("status=$($mv2.Status)")
Record "VAL-4.3.2 returned columnId is C2" ($mv2.Body.columnId -eq $C2) ("got=$($mv2.Body.columnId)")

$c1AfterCross = Call GET "/api/columns/$C1/tasks" $T1
$c1IdsAfterCross = $c1AfterCross.Body | ForEach-Object { $_.id }
Record "VAL-4.3.2 C1 no longer contains TK1" `
  (($c1AfterCross.Status -eq 200) -and -not ($c1IdsAfterCross -contains $TK1)) `
  ("c1Tasks=$($c1IdsAfterCross -join ',')")

$c2AfterCross = Call GET "/api/columns/$C2/tasks" $T1
$c2IdsAfterCross = $c2AfterCross.Body | ForEach-Object { $_.id }
Record "VAL-4.3.2 C2 contains TK1 at index 0" `
  (($c2AfterCross.Status -eq 200) -and ($c2IdsAfterCross[0] -eq $TK1)) `
  ("c2Tasks=$($c2IdsAfterCross -join ',')")

# ---------------------------------------------------------------------------
# Step 9 - VAL-4.3.3: toIndex clamps to column length
# ---------------------------------------------------------------------------
# Move TK3 from C1 to C2 (which now has TK1, TK4) at toIndex=999.
$mvClamp = Call POST "/api/columns/$C1/tasks/$TK3/move" $T1 @{ toColumnId = $C2; toIndex = 999 }
Record "VAL-4.3.3 clamp move 200" ($mvClamp.Status -eq 200) ("status=$($mvClamp.Status)")

$c2AfterClamp = Call GET "/api/columns/$C2/tasks" $T1
$c2IdsAfterClamp = $c2AfterClamp.Body | ForEach-Object { $_.id }
Record "VAL-4.3.3 TK3 is the LAST task in C2 (not at index 999)" `
  (($c2AfterClamp.Status -eq 200) -and ($c2IdsAfterClamp[-1] -eq $TK3)) `
  ("c2Tasks=$($c2IdsAfterClamp -join ',')")

# ---------------------------------------------------------------------------
# Step 10 - VAL-4.3.5..9: validation errors on the move endpoint
# ---------------------------------------------------------------------------
Record "VAL-4.3.5 non-UUID toColumnId -> 400" `
  (((Call POST "/api/columns/$C1/tasks/$TK2/move" $T1 @{ toColumnId = "not-a-uuid"; toIndex = 0 }).Status) -eq 400)

Record "VAL-4.3.6 negative toIndex -> 400" `
  (((Call POST "/api/columns/$C1/tasks/$TK2/move" $T1 @{ toColumnId = $C1; toIndex = -1 }).Status) -eq 400)

Record "VAL-4.3.7 non-integer toIndex -> 400" `
  (((Call POST "/api/columns/$C1/tasks/$TK2/move" $T1 @{ toColumnId = $C1; toIndex = "two" }).Status) -eq 400)

Record "VAL-4.3.8 missing field -> 400" `
  (((Call POST "/api/columns/$C1/tasks/$TK2/move" $T1 @{ toColumnId = $C1 }).Status) -eq 400)

Record "VAL-4.3.9 non-UUID :columnId -> 400" `
  (((Call POST "/api/columns/not-a-uuid/tasks/$TK2/move" $T1 @{ toColumnId = $C1; toIndex = 0 }).Status) -eq 400)

Record "VAL-4.3.9 non-UUID :taskId -> 400" `
  (((Call POST "/api/columns/$C1/tasks/not-a-uuid/move" $T1 @{ toColumnId = $C1; toIndex = 0 }).Status) -eq 400)

Record "VAL-4.3.10 unauthenticated -> 401" `
  (((Call POST "/api/columns/$C1/tasks/$TK2/move" $null @{ toColumnId = $C1; toIndex = 0 }).Status) -eq 401)

# ---------------------------------------------------------------------------
# Step 11 - VAL-4.3.11: non-member gets 403
# ---------------------------------------------------------------------------
$mv403 = Call POST "/api/columns/$C1/tasks/$TK2/move" $T3 @{ toColumnId = $C1; toIndex = 0 }
Record "VAL-4.3.11 non-member move -> 403" ($mv403.Status -eq 403) ("status=$($mv403.Status)")

# ---------------------------------------------------------------------------
# Step 12 - VAL-4.3.12: cross-board move is rejected (403, not 404)
# ---------------------------------------------------------------------------
# Build a fresh task on C1 to use for the cross-board attempt; TK1/TK2/TK3
# have all moved by now. The remaining tasks on C1 are TK2 only after
# the cross-column move + clamp move of TK3 to C2.
$c1Now = Call GET "/api/columns/$C1/tasks" $T1
$remainingInC1 = @($c1Now.Body | ForEach-Object { $_.id })
# If C1 is empty, create a new task to drive the cross-board attempt.
if (-not $remainingInC1 -or $remainingInC1.Count -eq 0) {
  $newT = Call POST "/api/columns/$C1/tasks" $T1 @{ title = "XBM-attempt" }
  $xbmTask = $newT.Body.id
} else {
  $xbmTask = $remainingInC1[0]
}

$mvXb = Call POST "/api/columns/$C1/tasks/$xbmTask/move" $T1 @{ toColumnId = $B2C1; toIndex = 0 }
Record "VAL-4.3.12 cross-board move -> 403" ($mvXb.Status -eq 403) ("status=$($mvXb.Status) raw=$($mvXb.Raw)")

# ---------------------------------------------------------------------------
# Step 13 - VAL-4.3.13/14: move to missing / soft-deleted column -> 404
# ---------------------------------------------------------------------------
$mvMissing = Call POST "/api/columns/$C1/tasks/$xbmTask/move" $T1 @{ toColumnId = "00000000-0000-0000-0000-000000000000"; toIndex = 0 }
Record "VAL-4.3.13 move to missing column -> 404" ($mvMissing.Status -eq 404) ("status=$($mvMissing.Status) raw=$($mvMissing.Raw)")

# Soft-delete B1 then attempt to move -> 404. Capture state first to
# restore if the rest of the script needs B1.
$delB1 = Call DELETE "/api/boards/$B1" $T1
Record "Soft-delete B1 (204) [precondition for VAL-4.3.14]" ($delB1.Status -eq 204)

# Use TK2 (still alive somewhere on B1) — the move should 404 because
# the source column is on a soft-deleted board.
Record "VAL-4.3.14 move on soft-deleted board source -> 404" `
  (((Call POST "/api/columns/$C1/tasks/$TK2/move" $T1 @{ toColumnId = $C1; toIndex = 0 }).Status) -eq 404)

# ---------------------------------------------------------------------------
# Step 14 - re-create B1 for the rest of the tests (column move, etc.)
# ---------------------------------------------------------------------------
$cb3 = Call POST "/api/boards" $T1 @{ title = "P4 Move" }
$B3 = $cb3.Body.id
$cm1 = Call POST "/api/boards/$B3/columns" $T1 @{ title = "M1" }
$M1 = $cm1.Body.id
$cm2 = Call POST "/api/boards/$B3/columns" $T1 @{ title = "M2" }
$M2 = $cm2.Body.id
$cm3 = Call POST "/api/boards/$B3/columns" $T1 @{ title = "M3" }
$M3 = $cm3.Body.id

# Capture initial ordering.
$colList = Call GET "/api/boards/$B3/columns" $T1
$initCols = $colList.Body | ForEach-Object { $_.id }
Record "Pre-step: B3 columns initially [M1, M2, M3]" `
  (($colList.Status -eq 200) -and ($initCols[0] -eq $M1) -and ($initCols[1] -eq $M2) -and ($initCols[2] -eq $M3)) `
  ("got=$($initCols -join ',')")

# ---------------------------------------------------------------------------
# Step 15 - VAL-4.4.1: single-column move
# ---------------------------------------------------------------------------
$mvCol = Call POST "/api/columns/$M1/move" $T1 @{ toIndex = 2 }
Record "VAL-4.4.1 column move 200" ($mvCol.Status -eq 200) ("status=$($mvCol.Status)")
Record "VAL-4.4.1 returned id is M1" ($mvCol.Body.id -eq $M1) ("got=$($mvCol.Body.id)")

$colList2 = Call GET "/api/boards/$B3/columns" $T1
$newCols = $colList2.Body | ForEach-Object { $_.id }
Record "VAL-4.4.1 ordering is [M2, M3, M1]" `
  (($colList2.Status -eq 200) -and ($newCols[0] -eq $M2) -and ($newCols[1] -eq $M3) -and ($newCols[2] -eq $M1)) `
  ("got=$($newCols -join ',')")

# ---------------------------------------------------------------------------
# Step 16 - VAL-4.4.5: PATCH /reorder (Phase 3 endpoint) still works
# ---------------------------------------------------------------------------
$reorder = Call PATCH "/api/boards/$B3/columns/reorder" $T1 @{ columnIds = @($M3, $M1, $M2) }
$reorderIds = $reorder.Body | ForEach-Object { $_.id }
Record "VAL-4.4.5 reorder endpoint 200" ($reorder.Status -eq 200) ("status=$($reorder.Status)")
Record "VAL-4.4.5 reorder result is [M3, M1, M2]" `
  (($reorderIds[0] -eq $M3) -and ($reorderIds[1] -eq $M1) -and ($reorderIds[2] -eq $M2)) `
  ("got=$($reorderIds -join ',')")

# ---------------------------------------------------------------------------
# Step 17 - VAL-4.4.2/3/4: column move validation + auth
# ---------------------------------------------------------------------------
Record "VAL-4.4.2 non-UUID :id -> 400" `
  (((Call POST "/api/columns/not-a-uuid/move" $T1 @{ toIndex = 0 }).Status) -eq 400)

Record "VAL-4.4.3 non-member move -> 403" `
  (((Call POST "/api/columns/$M1/move" $T3 @{ toIndex = 0 }).Status) -eq 403)

# Soft-delete B3 then attempt a column move -> 404.
$delB3 = Call DELETE "/api/boards/$B3" $T1
Record "VAL-4.4.4 soft-delete B3 (204) [precondition]" ($delB3.Status -eq 204)
Record "VAL-4.4.4 move on soft-deleted board -> 404" `
  (((Call POST "/api/columns/$M1/move" $T1 @{ toIndex = 0 }).Status) -eq 404)

# ---------------------------------------------------------------------------
# Step 18 - VAL-4.3.16: appends produce 1000-step Float positions
# ---------------------------------------------------------------------------
# Strategy: build a fresh board with one column, create tasks one at a
# time at the "end". Each new task's position should be MAX(prior) + 1000.
# Verifies the Float append math (no re-pack involved).
$cbR = Call POST "/api/boards" $T1 @{ title = "P4 Float" }
$BR = $cbR.Body.id
$ccR = Call POST "/api/boards/$BR/columns" $T1 @{ title = "FloatCol" }
$CR = $ccR.Body.id

# Create 10 tasks; the response body's `position` is a JSON number.
$floatTaskIds = @()
for ($i = 0; $i -lt 10; $i += 1) {
  $t = Call POST "/api/columns/$CR/tasks" $T1 @{ title = "F$i" }
  if ($t.Status -eq 201) {
    $floatTaskIds += $t.Body.id
  } else {
    break
  }
}
Record "VAL-4.3.16 created a task list (10 attempted)" ($floatTaskIds.Count -gt 0) `
  ("created=$($floatTaskIds.Count)")

# Read all tasks in the column ordered by position asc. Expect:
#   - All positions are numeric (Float, not String).
#   - Adjacent positions differ by ~1000 (1000, 2000, 3000, ...).
$floatCur = Call GET "/api/columns/$CR/tasks" $T1
$floatPositions = @()
foreach ($id in $floatTaskIds) {
  $p = ($floatCur.Body | Where-Object { $_.id -eq $id })[0].position
  $floatPositions += $p
}
Record "VAL-4.3.16 returned positions are numeric" `
  ($floatPositions | ForEach-Object { $_ -is [double] -or $_ -is [int] -or $_ -is [single] } | Select-Object -Unique) `
  ("positions=$($floatPositions -join ',')")

# Adjacent gaps should be exactly 1000 (every append is MAX + 1000).
# The $floatPositions values come back from the server as JSON numbers
# which PowerShell binds to [int] when the value has no decimal part
# (1000, 2000, ...) and [double] otherwise. We normalize to [int] via
# [int][double] so the comparison is type-stable.
$gapOk = $true
$gapSummary = @()
for ($j = 1; $j -lt $floatPositions.Count; $j += 1) {
  $gap = [int]([double]$floatPositions[$j] - [double]$floatPositions[$j - 1])
  $gapSummary += $gap
  if ($gap -ne 1000) { $gapOk = $false }
}
Record "VAL-4.3.16 append gaps are 1000" $gapOk `
  ("gaps=$($gapSummary -join ',')")

# ---------------------------------------------------------------------------
# Step 19 - VAL-4.3.17: re-keying C1 via move doesn't affect C2
# ---------------------------------------------------------------------------
# Build a board with two columns; populate both, then move tasks
# around in C1; verify C2's positions are unchanged.
$cbI = Call POST "/api/boards" $T1 @{ title = "P4 Iso" }
$BI = $cbI.Body.id
$ci1 = Call POST "/api/boards/$BI/columns" $T1 @{ title = "Iso1" }
$CI1 = $ci1.Body.id
$ci2 = Call POST "/api/boards/$BI/columns" $T1 @{ title = "Iso2" }
$CI2 = $ci2.Body.id
# Populate C2 with two tasks first.
$isoT1 = Call POST "/api/columns/$CI2/tasks" $T1 @{ title = "isoA" }
$isoT2 = Call POST "/api/columns/$CI2/tasks" $T1 @{ title = "isoB" }
$isoT1Id = $isoT1.Body.id
$isoT2Id = $isoT2.Body.id
$iso2Before = Call GET "/api/columns/$CI2/tasks" $T1
$iso2PositionsBefore = @(
  (($iso2Before.Body | Where-Object { $_.id -eq $isoT1Id }))[0].position,
  (($iso2Before.Body | Where-Object { $_.id -eq $isoT2Id }))[0].position
)
# Add tasks to C1 and re-key via PATCH /reorder (Phase 3 endpoint).
$c1t1 = Call POST "/api/columns/$CI1/tasks" $T1 @{ title = "isoC1-a" }
$c1t2 = Call POST "/api/columns/$CI1/tasks" $T1 @{ title = "isoC1-b" }
$c1t3 = Call POST "/api/columns/$CI1/tasks" $T1 @{ title = "isoC1-c" }
$c1t1Id = $c1t1.Body.id
$c1t2Id = $c1t2.Body.id
$c1t3Id = $c1t3.Body.id
# Reorder the columns (re-keys C1+C2 to fresh 1000-step Floats).
# The order here is a no-op (CI1, CI2 already in that order) but it
# exercises the PATCH /reorder endpoint against the Float schema.
$reorderBody = @{ columnIds = @($CI1, $CI2) }
$reorderResp = Call PATCH "/api/boards/$BI/columns/reorder" $T1 $reorderBody
Record "VAL-4.3.17 PATCH /reorder against Float positions returns 200" `
  ($reorderResp.Status -eq 200) ("status=$($reorderResp.Status)")

# Now verify C2's positions are unchanged after the reorder.
$iso2After = Call GET "/api/columns/$CI2/tasks" $T1
$iso2PositionsAfter = @(
  (($iso2After.Body | Where-Object { $_.id -eq $isoT1Id }))[0].position,
  (($iso2After.Body | Where-Object { $_.id -eq $isoT2Id }))[0].position
)
Record "VAL-4.3.17 C2 task positions are unchanged after C1 reorder" `
  (($iso2PositionsBefore[0] -eq $iso2PositionsAfter[0]) -and ($iso2PositionsBefore[1] -eq $iso2PositionsAfter[1])) `
  ("before=$($iso2PositionsBefore -join ',') after=$($iso2PositionsAfter -join ',')")

# ---------------------------------------------------------------------------
# Step 20 - VAL-4.3.15: move is atomic (task in exactly one column)
# ---------------------------------------------------------------------------
# Use a fresh task/column pair to do a clean cross-column move and
# verify the source column no longer contains the task.
$cbA = Call POST "/api/boards" $T1 @{ title = "P4 Atomic" }
$BA = $cbA.Body.id
$ca1 = Call POST "/api/boards/$BA/columns" $T1 @{ title = "A1" }
$CA1 = $ca1.Body.id
$ca2 = Call POST "/api/boards/$BA/columns" $T1 @{ title = "A2" }
$CA2 = $ca2.Body.id
$atomicTask = (Call POST "/api/columns/$CA1/tasks" $T1 @{ title = "atomic" }).Body.id
$mvA = Call POST "/api/columns/$CA1/tasks/$atomicTask/move" $T1 @{ toColumnId = $CA2; toIndex = 0 }
Record "VAL-4.3.15 atomic move 200" ($mvA.Status -eq 200) ("status=$($mvA.Status)")

$a1After = Call GET "/api/columns/$CA1/tasks" $T1
$a2After = Call GET "/api/columns/$CA2/tasks" $T1
$a1Ids = $a1After.Body | ForEach-Object { $_.id }
$a2Ids = $a2After.Body | ForEach-Object { $_.id }
$inA1 = $a1Ids -contains $atomicTask
$inA2 = $a2Ids -contains $atomicTask
Record "VAL-4.3.15 task is in EXACTLY ONE column after atomic move" `
  ((-not $inA1) -and $inA2) `
  ("inA1=$inA1 inA2=$inA2 a1=$($a1Ids -join ',') a2=$($a2Ids -join ',')")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "========================================"
Write-Host "Phase 4 end-to-end: $($Script:Pass) passed, $($Script:Fail) failed"
Write-Host "========================================"
if ($Script:Fail -gt 0) { exit 1 } else { exit 0 }
