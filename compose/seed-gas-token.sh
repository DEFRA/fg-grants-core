#!/usr/bin/env bash
set -euo pipefail

MONGO_HOST="${MONGO_HOST:-mongodb:27017}"
MONGO_DATABASE="${MONGO_DATABASE:-fg-gas-backend}"
TOKEN_HASH="${TOKEN_HASH}"

echo "Seeding GAS access token into $MONGO_DATABASE..."

mongosh "mongodb://$MONGO_HOST/$MONGO_DATABASE?directConnection=true" --eval "
  db.access_tokens.updateOne(
    { id: '$TOKEN_HASH' },
    { \$set: { id: '$TOKEN_HASH', client: 'grants-ui', expiresAt: null } },
    { upsert: true }
  );
  print('Token f081263c-6876-4d40-936f-ebdf63b5e893 seeded with hash ${TOKEN_HASH}.');
"
