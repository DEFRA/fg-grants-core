const { createHash, randomUUID } = require('crypto')

const token = randomUUID()
const hash = createHash('sha256').update(token, 'utf8').digest('hex')

console.log(`Token: ${token}`)
console.log(`Hash:  ${hash}`)
