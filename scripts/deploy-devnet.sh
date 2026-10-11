#!/usr/bin/env bash
# Grey Swan: upgrade the DEVNET program and bring Config up to date.
#
# Nothing here runs until you invoke it. Every step that sends something to
# devnet asks first (set YES=1 to skip the questions), stops the whole script on
# the first error, and prints a check afterwards. DRY_RUN=1 prints the commands
# and sends nothing.
#
#   scripts/deploy-devnet.sh preflight    read-only checks, spends nothing
#   scripts/deploy-devnet.sh all          preflight, then steps a to g in order
#   scripts/deploy-devnet.sh a|b|c|d|e|f|g   one step on its own
#   scripts/deploy-devnet.sh rollback     redeploy the backup .so
#
# Steps: a extend the program account, b upgrade the program, c migrate_config
# (runs straight after b, no pause), d init_pool, e create the verdict keypair,
# f update_config (verdict key + reviewer), g read back Config and the pool.
#
# Private keys are never printed; only public keys are.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

PROGRAM_ID="2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko"
CLUSTER_URL="${CLUSTER_URL:-https://api.devnet.solana.com}"
export RPC_URL="$CLUSTER_URL"

# Role keypairs. Public keys these must resolve to are checked in preflight.
UPGRADE_AUTHORITY_KEYPAIR="${UPGRADE_AUTHORITY_KEYPAIR:-$HOME/.config/solana/id.json}"   # 7y2YJbjSNCwcEEZpuwtFaBaPVtVZBwfza8NukQJLwBXR
ADMIN_KEYPAIR="${ADMIN_KEYPAIR:-$HOME/greyswan-admin-wallet.json}"                       # 76D6XPGqbxcrCddeLtfPLwG1ZfNMkveCpAtDSH3pzTb4
EXPECTED_AUTHORITY="7y2YJbjSNCwcEEZpuwtFaBaPVtVZBwfza8NukQJLwBXR"
EXPECTED_ADMIN="76D6XPGqbxcrCddeLtfPLwG1ZfNMkveCpAtDSH3pzTb4"

# The verdict key is generated here and kept OUTSIDE the repo.
VERDICT_KEYPAIR="${VERDICT_KEYPAIR:-$HOME/greyswan-secrets/verdict-keypair.json}"

# Suggested first reviewer: the default Solana CLI wallet (also the upgrade
# authority). It is not the admin and not the verdict key. The admin counts as
# a reviewer too, so admin + this wallet are the two distinct signers the
# program needs for large decisions. Override with REVIEWER_PUBKEY=...
REVIEWER_PUBKEY="${REVIEWER_PUBKEY:-7y2YJbjSNCwcEEZpuwtFaBaPVtVZBwfza8NukQJLwBXR}"

SO="${SO:-$REPO/target/deploy/greyswan.so}"
BACKUP_SO="${BACKUP_SO:-$HOME/greyswan-backups/greyswan-devnet-before-upgrade-20261011-1702.so}"
BACKUP_SHA256="c226a6f0f5a613fa9778d324e7139aff7c144a53dc41d90933900cda225f3d55"

TSX="$REPO/server/node_modules/.bin/tsx"
ADMIN_TS="$REPO/scripts/devnet-admin.ts"
SOL="solana -u $CLUSTER_URL"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '   ok: %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'printf "\n\033[31mA step failed (line %s). Nothing after it was run.\033[0m\n" "$LINENO" >&2' ERR

# Runs a command, or only prints it under DRY_RUN=1.
run() {
  printf '   $ %s\n' "$*"
  if [ "${DRY_RUN:-0}" = "1" ]; then return 0; fi
  "$@"
}

confirm() {
  [ "${DRY_RUN:-0}" = "1" ] && return 0
  [ "${YES:-0}" = "1" ] && return 0
  read -r -p "   $1 [y/N] " answer
  [ "$answer" = "y" ] || die "Not confirmed."
}

pubkey_of() { solana-keygen pubkey "$1"; }
so_size()   { stat -c %s "$SO"; }
onchain_len() { $SOL program show "$PROGRAM_ID" | awk '/Data Length/ {print $3}'; }
onchain_authority() { $SOL program show "$PROGRAM_ID" | awk '/^Authority/ {print $2}'; }
balance_sol() { $SOL balance "$1" | awk '{print $1}'; }

# ---------------------------------------------------------------- preflight
preflight() {
  say "Preflight (read-only)"
  case "$CLUSTER_URL" in *devnet*) ok "cluster is devnet ($CLUSTER_URL)";; *) die "CLUSTER_URL is not devnet";; esac

  [ -f "$SO" ] || die "No program binary at $SO. Run: anchor build"
  [ -f "$ADMIN_TS" ] && [ -x "$TSX" ] || die "Missing helper or tsx ($ADMIN_TS, $TSX)"
  newest_src=$(find programs/greyswan/src -name '*.rs' -newer "$SO" | head -1 || true)
  [ -z "$newest_src" ] || die "Program source is newer than the .so ($newest_src). Run: anchor build"
  ok "binary: $SO ($(so_size) bytes, sha256 $(sha256sum "$SO" | cut -c1-16)...)"

  [ "$(pubkey_of "$UPGRADE_AUTHORITY_KEYPAIR")" = "$EXPECTED_AUTHORITY" ] || die "Upgrade keypair is not $EXPECTED_AUTHORITY"
  [ "$(onchain_authority)" = "$EXPECTED_AUTHORITY" ] || die "On-chain upgrade authority is not $EXPECTED_AUTHORITY"
  ok "upgrade authority $EXPECTED_AUTHORITY matches the on-chain authority"

  [ "$(pubkey_of "$ADMIN_KEYPAIR")" = "$EXPECTED_ADMIN" ] || die "Admin keypair is not $EXPECTED_ADMIN"
  ok "admin keypair is $EXPECTED_ADMIN"

  [ -f "$BACKUP_SO" ] || die "Backup missing: $BACKUP_SO"
  [ "$(sha256sum "$BACKUP_SO" | cut -d' ' -f1)" = "$BACKUP_SHA256" ] || die "Backup .so hash does not match the recorded one"
  ok "backup present and its hash matches ($BACKUP_SO)"

  [ "$REVIEWER_PUBKEY" != "$EXPECTED_ADMIN" ] || die "Reviewer must not be the admin"
  ok "reviewer to add: $REVIEWER_PUBKEY"

  need=$(( $(so_size) - $(onchain_len) ))
  [ "$need" -gt 0 ] && ok "program account must grow by $need bytes" || ok "program account is already large enough"
  printf '   authority balance: %s SOL (needs about 5.2: extend ~1.6 + upgrade buffer ~3.3, returned after, + fees)\n' "$(balance_sol "$EXPECTED_AUTHORITY")"
  printf '   admin balance:     %s SOL (needs about 0.01 for migrate_config and init_pool)\n' "$(balance_sol "$EXPECTED_ADMIN")"
  awk -v b="$(balance_sol "$EXPECTED_AUTHORITY")" 'BEGIN{exit !(b>=5.2)}' || die "Upgrade authority has too little SOL"
  awk -v b="$(balance_sol "$EXPECTED_ADMIN")" 'BEGIN{exit !(b>=0.01)}' || die "Admin has too little SOL"
  ok "balances are sufficient"
}

# ---------------------------------------------------------------- a: extend
step_a() {
  say "a) Extend the program account if needed"
  need=$(( $(so_size) - $(onchain_len) ))
  if [ "$need" -le 0 ]; then ok "nothing to do"; return; fi
  confirm "Grow the program account by $need bytes (about 1.57 SOL of rent, paid by the upgrade authority)?"
  run solana program extend "$PROGRAM_ID" "$need" -u "$CLUSTER_URL" -k "$UPGRADE_AUTHORITY_KEYPAIR"
  [ "${DRY_RUN:-0}" = "1" ] && return
  [ "$(onchain_len)" -ge "$(so_size)" ] || die "Program account is still too small"
  ok "program data length is now $(onchain_len) bytes (binary is $(so_size))"
}

# ---------------------------------------------------------------- b: upgrade
step_b() {
  say "b) Upgrade the program"
  confirm "Upgrade $PROGRAM_ID with $SO? Step c (migrate_config) runs right after, with no pause."
  # --no-auto-extend: sizing is step a's job, so the cost is the one shown there.
  # If this fails part-way a buffer account is left holding SOL. List it with
  #   solana program show --buffers -u devnet
  # and either resume with --buffer <its keypair> or reclaim with
  #   solana program close --buffers -u devnet
  run solana program deploy "$SO" --program-id "$PROGRAM_ID" --upgrade-authority "$UPGRADE_AUTHORITY_KEYPAIR" \
    -k "$UPGRADE_AUTHORITY_KEYPAIR" -u "$CLUSTER_URL" --no-auto-extend --use-rpc
  [ "${DRY_RUN:-0}" = "1" ] && return
  tmp=$(mktemp)
  $SOL program dump "$PROGRAM_ID" "$tmp" >/dev/null
  cmp -n "$(so_size)" "$tmp" "$SO" || die "Deployed program does not match the local binary"
  rm -f "$tmp"
  ok "deployed program matches the local binary byte for byte"
  $SOL program show "$PROGRAM_ID" | sed 's/^/   /'
}

# ---------------------------------------------------------------- c: migrate
step_c() {
  say "c) migrate_config (signed by the admin keypair)"
  # Right after the upgrade there is no pause: until Config is migrated, every
  # instruction that reads it fails against the old 41-byte layout.
  [ "${CHAINED:-0}" = "1" ] || confirm "Migrate Config to the new layout (about 0.003 SOL, paid by the admin)?"
  run "$TSX" "$ADMIN_TS" migrate-config "$ADMIN_KEYPAIR"
  [ "${DRY_RUN:-0}" = "1" ] && return
  "$TSX" "$ADMIN_TS" read | sed 's/^/   /'
}

# ---------------------------------------------------------------- d: init pool
step_d() {
  say "d) init_pool"
  confirm "Create the user-protection pool (about 0.001 SOL, paid by the admin)?"
  run "$TSX" "$ADMIN_TS" init-pool "$ADMIN_KEYPAIR"
  [ "${DRY_RUN:-0}" = "1" ] && return
  "$TSX" "$ADMIN_TS" read | grep -i '^Pool' | sed 's/^/   /'
}

# ---------------------------------------------------------------- e: verdict key
step_e() {
  say "e) Verdict keypair (stored outside the repo)"
  case "$VERDICT_KEYPAIR" in "$REPO"/*) die "VERDICT_KEYPAIR must be outside the repo";; esac
  dir=$(dirname "$VERDICT_KEYPAIR")
  if [ -f "$VERDICT_KEYPAIR" ]; then
    ok "already exists, reusing it (never overwritten)"
  else
    confirm "Generate a new verdict keypair at $VERDICT_KEYPAIR?"
    if [ "${DRY_RUN:-0}" != "1" ]; then
      mkdir -p "$dir" && chmod 700 "$dir"
      solana-keygen new --no-bip39-passphrase --silent --outfile "$VERDICT_KEYPAIR"
      chmod 600 "$VERDICT_KEYPAIR"
    else
      printf '   $ solana-keygen new --no-bip39-passphrase --silent --outfile %s\n' "$VERDICT_KEYPAIR"
      return
    fi
  fi
  verdict_pub=$(pubkey_of "$VERDICT_KEYPAIR")
  [ "$verdict_pub" != "$EXPECTED_ADMIN" ] && [ "$verdict_pub" != "$REVIEWER_PUBKEY" ] || die "Verdict key collides with the admin or the reviewer"
  ok "verdict public key: $verdict_pub"
  ok "file mode: $(stat -c %a "$VERDICT_KEYPAIR") (must be 600)"
  echo "   It holds no SOL yet. Before the service can post verdicts, send it a little devnet SOL for fees."
}

# ---------------------------------------------------------------- f: update config
step_f() {
  say "f) update_config: set the verdict key and add a reviewer"
  [ -f "$VERDICT_KEYPAIR" ] || die "No verdict keypair yet. Run step e first."
  verdict_pub=$(pubkey_of "$VERDICT_KEYPAIR")
  echo "   verdict key: $verdict_pub"
  echo "   reviewer:    $REVIEWER_PUBKEY"
  confirm "Set these on Config (signed by the admin)? This replaces the whole reviewer list."
  run "$TSX" "$ADMIN_TS" update-config "$ADMIN_KEYPAIR" "$verdict_pub" "$REVIEWER_PUBKEY"
  [ "${DRY_RUN:-0}" = "1" ] && return
  "$TSX" "$ADMIN_TS" read | grep -E "verdict key|reviewers" | sed 's/^/   /'
}

# ---------------------------------------------------------------- g: read back
step_g() {
  say "g) Read back Config and the pool"
  "$TSX" "$ADMIN_TS" read | sed 's/^/   /'
  echo
  echo "   Server .env needs: VERDICT_KEYPAIR_PATH=$VERDICT_KEYPAIR"
  echo "   Frontend: no change (program id and IDL are unchanged in app/src/idl)."
}

# ---------------------------------------------------------------- rollback
rollback() {
  say "ROLLBACK: redeploy the backup of the previous program"
  [ -f "$BACKUP_SO" ] || die "Backup missing: $BACKUP_SO"
  [ "$(sha256sum "$BACKUP_SO" | cut -d' ' -f1)" = "$BACKUP_SHA256" ] || die "Backup hash mismatch"
  echo "   This puts the old program code back. It does NOT undo migrate_config, init_pool or"
  echo "   update_config: Config stays at its larger size and the pool stays. The old program reads"
  echo "   Config's first fields only, so this is expected to work, but that has not been tested."
  confirm "Redeploy the backup over $PROGRAM_ID?"
  run solana program deploy "$BACKUP_SO" --program-id "$PROGRAM_ID" --upgrade-authority "$UPGRADE_AUTHORITY_KEYPAIR" \
    -k "$UPGRADE_AUTHORITY_KEYPAIR" -u "$CLUSTER_URL" --no-auto-extend --use-rpc
  [ "${DRY_RUN:-0}" = "1" ] && return
  tmp=$(mktemp)
  $SOL program dump "$PROGRAM_ID" "$tmp" >/dev/null
  cmp -n "$(stat -c %s "$BACKUP_SO")" "$tmp" "$BACKUP_SO" || die "Rolled-back program does not match the backup"
  rm -f "$tmp"
  ok "program is the backed-up version again"
}

case "${1:-}" in
  preflight) preflight ;;
  all) preflight; step_a; step_b; CHAINED=1 step_c; step_d; step_e; step_f; step_g ;;
  a) preflight; step_a ;;
  b) preflight; step_b; CHAINED=1 step_c ;;   # b is always followed straight by c
  c) step_c ;;
  d) step_d ;;
  e) step_e ;;
  f) step_f ;;
  g) step_g ;;
  rollback) rollback ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
