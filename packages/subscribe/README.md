# @eto-press/subscribe

*The mail slot.*

A double-opt-in subscribe flow for a paper's mailing list, as two
Cloudflare Pages Functions: `POST /subscribe` sends the confirmation
mail, `GET /subscribe/confirm` adds the reader to the paper's SES
contact list. Stateless — the reader list lives in SES; the functions
carry a signed token and nothing else.

## Into a paper

Nothing deploys these for you. Copy `functions/` from this package into
the paper's directory, run `eto gen-functions` to write
`functions/_config.ts` from `eto.toml`, and deploy the site directory
with `wrangler pages deploy site`. The Pages project needs three
bindings: `SUBSCRIBE_SECRET` (any long random string — it signs the
confirmation token), `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
(an IAM user allowed to send mail and manage the contact list).

The rendered site's subscribe form posts to `/subscribe`, so a paper
with these functions deployed beside `site/` is done.

License: AGPL-3.0-only.
