#!/usr/bin/env bash
set -euo pipefail

MONGO_HOST="${MONGO_HOST:-mongodb:27017}"
MONGO_DATABASE="${MONGO_DATABASE:-fg-gas-backend}"
TOKEN_HASH="${TOKEN_HASH}"

echo "Seeding GAS access token for fg-grants-platform-admin into $MONGO_DATABASE..."

mongosh "mongodb://$MONGO_HOST/$MONGO_DATABASE?directConnection=true" --eval "
  db.access_tokens.updateOne(
    { id: '$TOKEN_HASH' },
    { \$setOnInsert: { client: 'fg-grants-platform-admin', clientId: 'fg-grants-platform-admin', expiresAt: null, createdAt: new Date() } },
    { upsert: true }
  );
  print('Token seeded for fg-grants-platform-admin with hash ${TOKEN_HASH}.');
"
