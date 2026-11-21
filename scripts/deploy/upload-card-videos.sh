#!/usr/bin/env bash
# Puts the Christmas card share videos (launch key card_share_video) into a hosted server's public file storage,
# from this Mac, using the storage settings already inside that server's running backend container. Copies the
# folder's christmas-*.mp4 films and uploads exactly those (all 67, or only new pictures' films, such as 68-89),
# writing only card-videos/v1/<design id>.mp4; nothing else changes.
#
#   scripts/deploy/upload-card-videos.sh <ssh target> <container> [folder]
#     e.g. scripts/deploy/upload-card-videos.sh ec2-user@<staging host> pantopus-backend-staging
#          scripts/deploy/upload-card-videos.sh ec2-user@<production host> pantopus-backend
#   folder: the films (default test-results/card-videos, made by frontend/apps/web/scripts/film-card-videos.cjs)
#
# The container must run a release that has backend/scripts/upload-card-videos.js (dev from November 14 on).
# SSH options (a key, -o IdentitiesOnly=yes) go in SSH_OPTS. Prints a dry run first and asks before uploading.
set -euo pipefail
TARGET=${1:?ssh target, e.g. ec2-user@host}
CONTAINER=${2:?backend container, e.g. pantopus-backend}
FOLDER=${3:-test-results/card-videos}
read -r -a SSH <<< "ssh ${SSH_OPTS:-}"
read -r -a SCP <<< "scp ${SSH_OPTS:-}"
count=$(find "$FOLDER" -maxdepth 1 -name 'christmas-*.mp4' | wc -l | tr -d ' ')
[ "$count" -gt 0 ] || { echo "no christmas-*.mp4 in $FOLDER"; exit 1; }
# The pictures these films are for, by their file names; the server refuses one it doesn't know.
ONLY=$(find "$FOLDER" -maxdepth 1 -name 'christmas-*.mp4' -exec basename {} .mp4 \; | sort | paste -sd, -)
[[ "$ONLY" =~ ^christmas-[0-9]{4}-[0-9]{2}(,christmas-[0-9]{4}-[0-9]{2})*$ ]] || { echo "unexpected file names in $FOLDER"; exit 1; }
echo "Copying $count videos to $TARGET:/tmp/card-videos"
"${SSH[@]}" "$TARGET" 'rm -rf /tmp/card-videos && mkdir -p /tmp/card-videos'
"${SCP[@]}" -q "$FOLDER"/christmas-*.mp4 "$TARGET:/tmp/card-videos/"
"${SSH[@]}" "$TARGET" "docker cp /tmp/card-videos $CONTAINER:/tmp/card-videos && docker exec $CONTAINER node scripts/upload-card-videos.js /tmp/card-videos --only $ONLY --dry-run | head -3"
read -r -p "Upload them to that server's storage now? [y/N] " answer
[ "$answer" = y ] || { echo "Not uploaded."; exit 0; }
"${SSH[@]}" "$TARGET" "docker exec $CONTAINER node scripts/upload-card-videos.js /tmp/card-videos --only $ONLY && docker exec -u root $CONTAINER rm -rf /tmp/card-videos; rm -rf /tmp/card-videos"
