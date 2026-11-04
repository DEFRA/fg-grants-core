#!/usr/bin/env bash
set -euo pipefail

MONGO_HOST="${MONGO_HOST:-mongodb:27017}"
MONGO_DATABASE="${MONGO_DATABASE:-fg-cw-backend}"
TOKEN_HASH="${TOKEN_HASH}"

echo "Seeding CW access token for fg-gas-backend into $MONGO_DATABASE..."

mongosh "mongodb://$MONGO_HOST/$MONGO_DATABASE?directConnection=true" --eval "
  db.access_tokens.updateOne(
    { id: '$TOKEN_HASH' },
    { \$setOnInsert: { client: 'fg-gas-backend', expiresAt: null, createdAt: new Date() } },
    { upsert: true }
  );
  print('Token seeded for fg-gas-backend.');
"
