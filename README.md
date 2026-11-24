# RICH MD WhatsApp Bot

RICH MD is a multi-bot WhatsApp project based on Baileys. Bot display branding is set to **RICH MD**. WhatsApp credentials and Signal keys are stored in MongoDB, isolated by bot phone number, and connected bots can follow a configured WhatsApp Channel and react to new posts.

## Configure

1. Install Node.js 22 or newer and run `npm install`.
2. Copy `.env.example` to `.env` for local use, or set the same variables in your hosting provider’s environment settings.
3. Set `MONGODB_URI` to your own MongoDB connection string. Keep it private and restrict access to the database. The default database is `rich_md`.
4. The provided channel defaults are `120363402325089913@newsletter` and reaction `🫴`. Change `CHANNEL_JID` or `REACT_EMOJI` only if you want different values.
5. Optionally set `BOT_OWNER` (international number, digits only) and `OWNER_NAME`. The project does not ship with the previous project owner’s number or identity. Set `BOT_CHANNEL_LINK` only if you have a public channel URL; a Channel JID is not itself a public channel URL.
6. `BOT_GROUPS_TO_JOIN` is empty by default. If desired, set it to comma-separated group invite links you authorize the bot to join.
7. Start the service with `npm start`.

## MongoDB session layout

Authentication documents are stored in the `wa_auth` collection. Each document is tagged with its bot number and key; credentials and each Signal key are stored independently, preventing different sub-bots from sharing sessions. On startup, the project restores sessions found in MongoDB. If an old local session exists under `auth/subbots/<number>/creds.json` and MongoDB has no session for that number, the project imports the credentials and migrates old key records as Baileys requests them. Keep legacy auth files private until the migrated bot has reconnected successfully.

A manual disconnect or a WhatsApp logout clears that bot’s MongoDB auth state. A transient reconnect failure preserves the MongoDB session. For deployments that run multiple copies of the service, use a single active instance unless you have separately configured distributed connection coordination.

## Channel reactions

When each bot connects, it attempts to follow `CHANNEL_JID` and subscribe to channel updates. New posts from that exact channel are reacted to with `REACT_EMOJI`; repeated post IDs are de-duplicated during the process lifetime. Actual channel update/reaction support depends on the installed Baileys build and WhatsApp access for the linked account. Verify that the service logs a successful channel subscription and reaction after deployment.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string; required | — |
| `MONGODB_DB` | Database name | `rich_md` |
| `BOT_NAME` | Display name | `RICH MD` |
| `CHANNEL_JID` | Channel followed/reacted to | `120363402325089913@newsletter` |
| `REACT_EMOJI` | Reaction for new channel posts | `🫴` |
| `BOT_OWNER` | Optional owner number for owner-only commands | — |
| `OWNER_NAME` | Optional owner display name | — |
| `BOT_CHANNEL_LINK` | Optional public channel URL for menu output | — |
| `BOT_GROUPS_TO_JOIN` | Optional comma-separated authorized invite links | — |
| `PORT` | Web dashboard port | `3000` |

Do not include `.env`, MongoDB URIs, WhatsApp session files, or other credentials in a public repository or ZIP shared with others.
