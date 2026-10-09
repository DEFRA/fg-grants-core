#!/usr/bin/env bash
set -euo pipefail

MONGO_HOST="${MONGO_HOST:-mongodb:27017}"
MONGO_DATABASE="${MONGO_DATABASE:-fg-cw-backend}"
TOKEN_HASH="${TOKEN_HASH}"

echo "Seeding CW access token for fg-grants-platform-admin into $MONGO_DATABASE..."

mongosh "mongodb://$MONGO_HOST/$MONGO_DATABASE?directConnection=true" --eval "
  db.access_tokens.updateOne(
    { client: 'fg-grants-platform-admin' },
    { \$set: { id: '$TOKEN_HASH', client: 'fg-grants-platform-admin', expiresAt: null } },
    { upsert: true }
  );
  print('Token seeded for fg-grants-platform-admin with hash ${TOKEN_HASH}.');
"
