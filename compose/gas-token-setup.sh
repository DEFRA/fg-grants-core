#!/bin/sh
set -e

mongosh "mongodb://mongodb:27017/?directConnection=true" --quiet --eval "
  db = db.getSiblingDB('fg-gas-backend');
  db.access_tokens.replaceOne(
    { client: 'grants-ui' },
    { id: '$GAS_TOKEN_HASH', client: 'grants-ui', expiresAt: null },
    { upsert: true }
  );
  print('Token hash upserted for grants-ui');
"
