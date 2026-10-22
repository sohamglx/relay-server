# Authentication

Set `JWT_SECRET` to a long, random secret in the server environment. The server
also requires `DB_URI`. After adding the auth session table, apply the schema:

```sh
npm run db:push
```

`POST /auth/reg` and `POST /auth/login` return a public `user` object, a
15-minute `accessToken`, and a 7-day `refreshToken`. Send the access token to
protected endpoints as `Authorization: Bearer <accessToken>`. Refresh tokens
are stored as hashes and rotated whenever they are used.

Registration accepts `username`, `email`, and `password`. Login accepts either
`email` or `username` together with `password`. Both endpoints return the same
token response shape:

```json
{
  "user": {
    "uid": "user-id",
    "username": "soham",
    "email": "soham@example.com",
    "name": ""
  },
  "accessToken": "<accessToken>",
  "refreshToken": "<refreshToken>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresIn": 604800
}
```

To refresh a token pair, send:

```json
{
  "refreshToken": "<refreshToken>"
}
```

to `POST /auth/refresh`, then replace both stored tokens with the returned
values. You may alternatively send the refresh token in the Authorization
Bearer header. A refresh token can only be used once; discard the old token
after a successful refresh.