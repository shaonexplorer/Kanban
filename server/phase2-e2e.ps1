# Phase 2 end-to-end manual scenario.
# Runs the 13-step happy path from specs/Phase02/Validation.md plus a
# battery of negative cases. Prints a compact pass/fail summary at the end.
#
# Usage: powershell -ExecutionPolicy Bypass -File phase2-e2e.ps1
# Assumes the dev server is running on http://localhost:4000.

$ErrorActionPreference = "Continue"
$Base = "http://localhost:4000"

# Use a unique suffix per run so the script is idempotent.
$Suffix = ([guid]::NewGuid().ToString("N")).Substring(0, 8)
$U1    = "u1-$Suffix@example.com"
$U2    = "u2-$Suffix@example.com"
$U3    = "u3-$Suffix@example.com"
$Ghost = "ghost-$Suffix@example.com"
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

$r2 = Call POST "/api/auth/register" $null @{ email = $U2; password = $Pw }
Record "Register u2 (201)" ($r2.Status -eq 201) ("status=$($r2.Status)")

$r3 = Call POST "/api/auth/register" $null @{ email = $U3; password = $Pw }
Record "Register u3 (201)" ($r3.Status -eq 201) ("status=$($r3.Status)")

# Register returns { id, email, token }; capture ids there.
$U1Id = $r1.Body.id
$U2Id = $r2.Body.id
$U3Id = $r3.Body.id

# Then log them in for fresh JWTs (login returns { email, token }).
$l1 = Call POST "/api/auth/login" $null @{ email = $U1; password = $Pw }
Record "Login u1 (200, token present)" (($l1.Status -eq 200) -and $l1.Body.token)
$T1 = $l1.Body.token

$l2 = Call POST "/api/auth/login" $null @{ email = $U2; password = $Pw }
Record "Login u2 (200, token present)" (($l2.Status -eq 200) -and $l2.Body.token)
$T2 = $l2.Body.token

$l3 = Call POST "/api/auth/login" $null @{ email = $U3; password = $Pw }
Record "Login u3 (200, token present)" (($l3.Status -eq 200) -and $l3.Body.token)
$T3 = $l3.Body.token

# ---------------------------------------------------------------------------
# Step 2 - u1 creates a board
# ---------------------------------------------------------------------------
$cb = Call POST "/api/boards" $T1 @{ title = "Demo" }
Record "VAL-2.3.2 Create board (201)" ($cb.Status -eq 201) ("status=$($cb.Status) body=$($cb.Raw)")
$B1 = $cb.Body.id

Record "VAL-2.3.3 Empty title rejected (400)" `
  (((Call POST "/api/boards" $T1 @{ title = "" }).Status) -eq 400)

$bigTitle = "x" * 201
Record "VAL-2.3.4 Oversized title rejected (400)" `
  (((Call POST "/api/boards" $T1 @{ title = $bigTitle }).Status) -eq 400)

Record "VAL-2.3.5 Unauth create rejected (401)" `
  (((Call POST "/api/boards" $null @{ title = "NoAuth" }).Status) -eq 401)

# ---------------------------------------------------------------------------
# Step 3 - u1 invites u2 by email -> captures $I1
# ---------------------------------------------------------------------------
$inv = Call POST "/api/boards/$B1/members" $T1 @{ email = $U2 }
Record "VAL-2.8.1 Invite by email (201, inviteeId=u2.id)" `
  (($inv.Status -eq 201) -and ($inv.Body.inviteeId -eq $U2Id))
$I1 = $inv.Body.id

Record "VAL-2.8.4 Unknown email returns 404" `
  (((Call POST "/api/boards/$B1/members" $T1 @{ email = $Ghost }).Status) -eq 404)

Record "VAL-2.8.5 Inviting the owner rejected (400)" `
  (((Call POST "/api/boards/$B1/members" $T1 @{ userId = $U1Id }).Status) -eq 400)

Record "VAL-2.8.3 Empty invite body rejected (400)" `
  (((Call POST "/api/boards/$B1/members" $T1 @{}).Status) -eq 400)

Record "VAL-2.8.3 Both userId+email rejected (400)" `
  (((Call POST "/api/boards/$B1/members" $T1 @{ userId = $U2Id; email = $U2 }).Status) -eq 400)

Record "VAL-2.8.6 Duplicate pending invite rejected (409)" `
  (((Call POST "/api/boards/$B1/members" $T1 @{ email = $U2 }).Status) -eq 409)

# ---------------------------------------------------------------------------
# Step 4 - u2 lists pending invitations, sees $I1
# ---------------------------------------------------------------------------
$list = Call GET "/api/board-invitations" $T2
$found = $list.Body | Where-Object { $_.id -eq $I1 }
Record "VAL-2.11.1 u2 sees pending invite" (($list.Status -eq 200) -and $found) `
  ("status=$($list.Status) count=$(if ($list.Body) { $list.Body.Count } else { 0 })")

# u3 (not invited) should see an empty list.
$list3 = Call GET "/api/board-invitations" $T3
Record "u3 sees no invitations" (($list3.Status -eq 200) -and ($list3.Body.Count -eq 0))

# ---------------------------------------------------------------------------
# Step 5 - u2 accepts the invite
# ---------------------------------------------------------------------------
$acc = Call POST "/api/board-invitations/$I1/accept" $T2
Record "VAL-2.11.2 Accept invite (200, status=ACCEPTED)" `
  (($acc.Status -eq 200) -and ($acc.Body.status -eq "ACCEPTED"))

Record "VAL-2.11.3 Double-accept rejected (409)" `
  (((Call POST "/api/board-invitations/$I1/accept" $T2).Status) -eq 409)

# ---------------------------------------------------------------------------
# Step 6 - u2 sees the board with role MEMBER; u3 gets 403
# ---------------------------------------------------------------------------
$lb2 = Call GET "/api/boards" $T2
$shared = $lb2.Body | Where-Object { $_.id -eq $B1 }
Record "VAL-2.4.2 u2 lists boards with role MEMBER" `
  (($lb2.Status -eq 200) -and $shared -and ($shared.role -eq "MEMBER"))

# VAL-2.5.2 - u3 forbidden on the board.
$gb3 = Call GET "/api/boards/$B1" $T3
Record "VAL-2.5.2 u3 GET board -> 403" ($gb3.Status -eq 403) ("status=$($gb3.Status)")

# VAL-2.5.1 - owner can read; response shape. The shape contract is:
#   columns: []  (array, even when empty)
#   members: [{ userId, email, role, joinedAt }, ...] (owner first, then accepted collaborators)
# An empty `[]` is a System.Object[]; -ne $null evaluates to $false
# because PowerShell unrolls the array and reports "no comparison was true".
# So check the type instead.
$gb1 = Call GET "/api/boards/$B1" $T1
$shapeOK = ($gb1.Status -eq 200) `
  -and ($gb1.Body.columns -is [System.Array]) `
  -and ($gb1.Body.members  -is [System.Array]) `
  -and ($gb1.Body.members.Count -eq 2)
Record "VAL-2.5.1 Owner GET board shape" $shapeOK `
  ("status=$($gb1.Status) members=$(if ($gb1.Body.members) { $gb1.Body.members.Count } else { 'n/a' })")

# VAL-2.4.1 - owner lists boards with role OWNER.
$lb1 = Call GET "/api/boards" $T1
$owned = $lb1.Body | Where-Object { $_.id -eq $B1 }
Record "VAL-2.4.1 Owner lists board with role OWNER" `
  (($lb1.Status -eq 200) -and $owned -and ($owned.role -eq "OWNER"))

# VAL-2.5.3 - missing board -> 404.
Record "VAL-2.5.3 Missing board -> 404" `
  (((Call GET "/api/boards/00000000-0000-0000-0000-000000000000" $T1).Status) -eq 404)

# VAL-2.5.4 - non-UUID id -> 400.
Record "VAL-2.5.4 Non-UUID id -> 400" `
  (((Call GET "/api/boards/not-a-uuid" $T1).Status) -eq 400)

# ---------------------------------------------------------------------------
# Step 7-8 - u1 renames the board; u2 cannot
# ---------------------------------------------------------------------------
$ren = Call PATCH "/api/boards/$B1" $T1 @{ title = "Demo v2" }
Record "VAL-2.6.1 Owner rename (200)" `
  (($ren.Status -eq 200) -and ($ren.Body.title -eq "Demo v2"))

Record "VAL-2.6.2 Member cannot rename (403)" `
  (((Call PATCH "/api/boards/$B1" $T2 @{ title = "Hax" }).Status) -eq 403)

# ---------------------------------------------------------------------------
# Step 9 - u1 lists members (OWNER first, then MEMBER)
# ---------------------------------------------------------------------------
$lm = Call GET "/api/boards/$B1/members" $T1
$firstIsOwner = ($lm.Status -eq 200) -and ($lm.Body.Count -eq 2) -and ($lm.Body[0].role -eq "OWNER") -and ($lm.Body[1].role -eq "MEMBER")
Record "VAL-2.9.1 Members listed owner-first" $firstIsOwner `
  ("status=$($lm.Status) count=$(if ($lm.Body) { $lm.Body.Count } else { 'n/a' }) roles=$(if ($lm.Body) { ($lm.Body | ForEach-Object { $_.role }) -join ',' } else { '' })")

$isoDate = $true
foreach ($m in $lm.Body) {
  try { $null = [datetime]::Parse($m.joinedAt) } catch { $isoDate = $false }
}
Record "VAL-2.9.2 joinedAt is ISO-parseable" $isoDate

Record "VAL-2.9.3 Non-member gets 403 on members list" `
  (((Call GET "/api/boards/$B1/members" $T3).Status) -eq 403)

# VAL-2.8.8 - member (non-owner) cannot invite.
Record "VAL-2.8.8 Member cannot invite (403)" `
  (((Call POST "/api/boards/$B1/members" $T2 @{ email = $U3 }).Status) -eq 403)

# ---------------------------------------------------------------------------
# Step 10 - u1 removes u2
# ---------------------------------------------------------------------------
$rm = Call DELETE "/api/boards/$B1/members/$U2Id" $T1
Record "VAL-2.10.1 Owner removes member (204)" ($rm.Status -eq 204) ("status=$($rm.Status)")

Record "VAL-2.10.2 Cannot remove owner (400)" `
  (((Call DELETE "/api/boards/$B1/members/$U1Id" $T1).Status) -eq 400)

Record "VAL-2.10.4 Removing non-member -> 404" `
  (((Call DELETE "/api/boards/$B1/members/$U3Id" $T1).Status) -eq 404)

Record "VAL-2.10.3 Non-owner (member) cannot remove (403)" `
  (((Call DELETE "/api/boards/$B1/members/$U3Id" $T2).Status) -eq 403)

# ---------------------------------------------------------------------------
# Step 11 - u2 can no longer see the board
# ---------------------------------------------------------------------------
$gb2After = Call GET "/api/boards/$B1" $T2
Record "After removal u2 gets 403 on board" ($gb2After.Status -eq 403) ("status=$($gb2After.Status)")

# ---------------------------------------------------------------------------
# VAL-2.11.6/7 - issue a fresh invite, decline it, then verify it is gone.
# ---------------------------------------------------------------------------
$inv2 = Call POST "/api/boards/$B1/members" $T1 @{ email = $U2 }
$I2 = $inv2.Body.id
Record "Fresh invite to u2 (201)" ($inv2.Status -eq 201) ("status=$($inv2.Status)")

$dec = Call POST "/api/board-invitations/$I2/decline" $T2
Record "VAL-2.11.6 Decline invite (200, status=DECLINED)" `
  (($dec.Status -eq 200) -and ($dec.Body.status -eq "DECLINED"))

$listAfter = Call GET "/api/board-invitations" $T2
$stillThere = $listAfter.Body | Where-Object { $_.id -eq $I2 }
Record "VAL-2.11.7 Declined invite not in pending list" `
  (($listAfter.Status -eq 200) -and -not $stillThere)

# VAL-2.11.4 - wrong user cannot accept/decline.
$inv3 = Call POST "/api/boards/$B1/members" $T1 @{ email = $U2 }
$I3 = $inv3.Body.id
Record "VAL-2.11.4 u3 cannot accept someone else's invite (403)" `
  (((Call POST "/api/board-invitations/$I3/accept" $T3).Status) -eq 403)
Record "u3 cannot decline someone else's invite (403)" `
  (((Call POST "/api/board-invitations/$I3/decline" $T3).Status) -eq 403)

# VAL-2.11.5 - accept of soft-deleted board -> 404.
$inv4 = Call POST "/api/boards/$B1/members" $T1 @{ email = $U2 }
$I4 = $inv4.Body.id
$del = Call DELETE "/api/boards/$B1" $T1
Record "VAL-2.7.1 Owner soft-deletes board (204)" ($del.Status -eq 204) ("status=$($del.Status)")
Record "VAL-2.11.5 Accept on soft-deleted board -> 404" `
  (((Call POST "/api/board-invitations/$I4/accept" $T2).Status) -eq 404)

# VAL-2.7.4 - deleting again -> 404.
Record "VAL-2.7.4 Second delete returns 404" `
  (((Call DELETE "/api/boards/$B1" $T1).Status) -eq 404)

# VAL-2.4.3 - soft-deleted board excluded from list.
$listAfterDel = Call GET "/api/boards" $T1
$stillListed = $listAfterDel.Body | Where-Object { $_.id -eq $B1 }
Record "VAL-2.4.3 Soft-deleted board excluded from list" `
  (($listAfterDel.Status -eq 200) -and -not $stillListed)

# VAL-2.6.4 - PATCH on soft-deleted board -> 404.
# (Need a new board because $B1 is now soft-deleted.)
$cb2 = Call POST "/api/boards" $T1 @{ title = "SoftDelete" }
$B2 = $cb2.Body.id
$del2 = Call DELETE "/api/boards/$B2" $T1
Record "Soft-delete B2 (204)" ($del2.Status -eq 204)
Record "VAL-2.6.4 PATCH on soft-deleted board -> 404" `
  (((Call PATCH "/api/boards/$B2" $T1 @{ title = "Nope" }).Status) -eq 404)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "========================================"
Write-Host "Phase 2 end-to-end: $($Script:Pass) passed, $($Script:Fail) failed"
Write-Host "========================================"
if ($Script:Fail -gt 0) { exit 1 } else { exit 0 }
