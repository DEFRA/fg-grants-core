export const clients = [
  {
    id: 'client1',
    secret: 'secret1',
    redirectURIs: [
      'http://localhost:3000/login/callback',
      'http://localhost:3100/login/callback'
    ],
    scopes: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'api://client1/cw.backend'
    ]
  }
]
