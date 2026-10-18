#!/usr/bin/env bash
set -uo pipefail

OLD_REF="zqniborlnbpkjdmyssnl"
OLD_PASS='6IkcFATaZt6TvFok'
NEW_PASS='Ppik05N9nof4UauO'
EXCLUDE="public.page_views,public.notifications,public.notification_deliveries,public.proctoring_media,public.activity_logs"
SKIP_BUCKETS="recordings,proctoring-media"
SKIP_FUNCS="diag-egress-check check-ai-keys-tmp test-webpush-tmp debug-webpush-diag check-recording-secrets check-exam-audio-secrets"

echo "Answer 5 questions (right-click or long-press to paste):"
read -r -p "1) NEW project ref (the letters in its URL): " NEW_REF
read -r -p "2) NEW project region [eu-west-1]: " NEW_REGION; NEW_REGION=${NEW_REGION:-eu-west-1}
read -r -p "3) OLD service_role key: " OLD_SERVICE_KEY
read -r -p "4) NEW service_role key: " NEW_SERVICE_KEY
read -r -p "5) Supabase access token (supabase.com/dashboard/account/tokens): " SUPABASE_ACCESS_TOKEN
export SUPABASE_ACCESS_TOKEN

pick_db() { # ref pass region -> prints a working pooler URL
  for p in aws-0 aws-1; do
    u="postgresql://postgres.$1:$2@$p-$3.pooler.supabase.com:5432/postgres"
    if psql "$u" -c 'select 1' >/dev/null 2>&1; then echo "$u"; return 0; fi
  done
  return 1
}
OLD_DB=$(pick_db "$OLD_REF" "$OLD_PASS" eu-west-1) || { echo "Cannot connect to OLD database. Check password/region."; exit 1; }
NEW_DB=$(pick_db "$NEW_REF" "$NEW_PASS" "$NEW_REGION") || { echo "Cannot connect to NEW database. Check ref, region and password."; exit 1; }
echo "Both databases reachable."

mkdir -p work && cd work
OLD_URL="https://${OLD_REF}.supabase.co"
NEW_URL="https://${NEW_REF}.supabase.co"

echo; echo "===== 1/3 DATABASE ====="
npx -y supabase db dump --db-url "$OLD_DB" -f roles.sql --role-only
npx -y supabase db dump --db-url "$OLD_DB" -f schema.sql
npx -y supabase db dump --db-url "$OLD_DB" -f data_public.sql --use-copy --data-only -x "$EXCLUDE"
npx -y supabase db dump --db-url "$OLD_DB" -f data_auth.sql --use-copy --data-only --schema auth
psql "$NEW_DB" --single-transaction -f roles.sql -f schema.sql \
  -c 'SET session_replication_role = replica' -f data_public.sql -f data_auth.sql \
  || echo "!! DB restore reported errors, scroll up. 'already exists' errors on roles are normal."
psql "$NEW_DB" -c "select count(*) lessons from public.lessons;" -c "select count(*) auth_users from auth.users;"

echo; echo "===== 2/3 STORAGE ====="
pip install -q --break-system-packages requests 2>/dev/null || pip install -q requests
cat > copy_storage.py <<'PY'
import os, requests, tempfile, mimetypes
OLD, NEW = os.environ["OLD_URL"], os.environ["NEW_URL"]
OK, NK = os.environ["OLD_SERVICE_KEY"], os.environ["NEW_SERVICE_KEY"]
SKIP = set(filter(None, os.environ.get("SKIP_BUCKETS", "").split(",")))
oh = {"Authorization": f"Bearer {OK}", "apikey": OK}
nh = {"Authorization": f"Bearer {NK}", "apikey": NK}

def walk(bucket, prefix=""):
    offset = 0
    while True:
        r = requests.post(f"{OLD}/storage/v1/object/list/{bucket}", headers=oh,
            json={"prefix": prefix, "limit": 100, "offset": offset, "sortBy": {"column": "name", "order": "asc"}})
        r.raise_for_status()
        items = r.json()
        if not items: return
        for it in items:
            path = f"{prefix}{it['name']}"
            if it.get("id") is None:
                yield from walk(bucket, path + "/")
            else:
                yield path
        if len(items) < 100: return
        offset += 100

buckets = requests.get(f"{OLD}/storage/v1/bucket", headers=oh).json()
failed = []
for b in buckets:
    name = b["name"]
    if name in SKIP:
        print(f"skip bucket {name}"); continue
    body = {"id": name, "name": name, "public": b.get("public", False)}
    if b.get("file_size_limit"): body["file_size_limit"] = b["file_size_limit"]
    if b.get("allowed_mime_types"): body["allowed_mime_types"] = b["allowed_mime_types"]
    r = requests.post(f"{NEW}/storage/v1/bucket", headers=nh, json=body)
    if r.status_code >= 400 and "already exists" not in r.text.lower():
        body.pop("file_size_limit", None)
        r = requests.post(f"{NEW}/storage/v1/bucket", headers=nh, json=body)
        if r.status_code >= 400 and "already exists" not in r.text.lower():
            print(f"!! could not create bucket {name}: {r.text}"); continue
    n = 0
    for path in walk(name):
        enc = requests.utils.quote(path)
        with requests.get(f"{OLD}/storage/v1/object/{name}/{enc}", headers=oh, stream=True) as d:
            if d.status_code >= 400:
                failed.append((name, path, "download " + str(d.status_code))); continue
            ctype = d.headers.get("content-type") or mimetypes.guess_type(path)[0] or "application/octet-stream"
            with tempfile.TemporaryFile() as tmp:
                for chunk in d.iter_content(1 << 20): tmp.write(chunk)
                tmp.seek(0)
                u = requests.post(f"{NEW}/storage/v1/object/{name}/{enc}",
                    headers={**nh, "Content-Type": ctype, "x-upsert": "true"}, data=tmp)
        if u.status_code >= 400: failed.append((name, path, "upload " + u.text[:120]))
        else: n += 1
    print(f"bucket {name}: copied {n} files")
print("FAILED FILES:", failed if failed else "none")
PY
OLD_URL="$OLD_URL" NEW_URL="$NEW_URL" OLD_SERVICE_KEY="$OLD_SERVICE_KEY" NEW_SERVICE_KEY="$NEW_SERVICE_KEY" \
  SKIP_BUCKETS="$SKIP_BUCKETS" python3 copy_storage.py

echo; echo "===== 3/3 EDGE FUNCTIONS ====="
NO_JWT=" vapid-public-key livekit-egress-webhook public-class-token paystack-webhook schedule-class-reminders send-notification tahleem-ai gm-auto-launch notify-content-upload "
mkdir -p supabase/functions
SLUGS=$(npx -y supabase functions list --project-ref "$OLD_REF" 2>/dev/null | awk -F'|' 'NR>2 {gsub(/ /,"",$2); if ($2!="") print $2}')
for s in $SLUGS; do
  case " $SKIP_FUNCS " in *" $s "*) echo "skip $s"; continue;; esac
  echo "-- $s"
  npx -y supabase functions download "$s" --project-ref "$OLD_REF" --use-api || { echo "!! download failed: $s"; continue; }
  flag=""; case "$NO_JWT" in *" $s "*) flag="--no-verify-jwt";; esac
  npx -y supabase functions deploy "$s" --project-ref "$NEW_REF" --use-api $flag || echo "!! deploy failed: $s"
done

echo; echo "===== DONE ====="
echo "NEW project ref: $NEW_REF"
echo "Still to do: set secrets, update Vercel env vars, redo Google OAuth, tell Claude to copy storage policies."
