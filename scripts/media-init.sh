#!/usr/bin/env bash
# Bootstrap the RustFS media bucket: create `media`, allow anonymous GET,
# optionally sync a local directory (./media-seed by default).
# Usage: ./scripts/media-init.sh [--sync <dir>]
set -euo pipefail
cd "$(dirname "$0")/.."

AK=$(grep '^RUSTFS_ACCESS_KEY=' .env | cut -d= -f2-)
SK=$(grep '^RUSTFS_SECRET_KEY=' .env | cut -d= -f2-)
NET=$(docker compose ps --format '{{.Name}}' | head -1 >/dev/null; docker inspect solhack-media-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')

cat > /tmp/media-policy.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["s3:GetObject"],
    "Resource": ["arn:aws:s3:::media/*"]
  }]
}
JSON

aws() { docker run --rm --network "$NET" -v "$(pwd)":/work -e AWS_ACCESS_KEY_ID="$AK" -e AWS_SECRET_ACCESS_KEY="$SK" amazon/aws-cli:latest s3api "$@" --endpoint-url http://media:9000; }
awss3() { docker run --rm --network "$NET" -v "$(pwd)":/work -e AWS_ACCESS_KEY_ID="$AK" -e AWS_SECRET_ACCESS_KEY="$SK" amazon/aws-cli:latest s3 "$@" --endpoint-url http://media:9000; }

awss3 mb s3://media 2>/dev/null || echo "bucket exists"
aws put-bucket-policy --bucket media --policy file:///tmp/media-policy.json
echo "bucket `media` ready (anonymous GET)"

DIR="${2:-}"
if [ -n "$DIR" ] && [ -d "$DIR" ]; then
  awss3 sync "$DIR" s3://media/ >/dev/null
  echo "synced $DIR → s3://media/"
fi
