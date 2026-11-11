# Leads CRM: Jennifer Richardson Fanning Insurance Agency

A small CRM for **SmartFinancial** insurance leads (Auto, Home, Renters,
Commercial):

- **Leads come in automatically** from SmartFinancial (direct post, or their
  lead emails forwarded). Every section is filled in: contact, existing
  coverage, desired coverage, drivers, vehicles, home details, business info.
- **Every new lead is emailed** to one or more addresses.
- **A welcome text goes out right away** (or at the start of texting hours),
  with a **tap-to-call link** to the office number. The number can be changed
  per lead type or per lead.
- **An AI assistant answers lead replies by text**, and hands off to you
  (with an email) when a person is needed.
- **Follow-up texts** go out automatically on the days you choose, until the
  lead replies.
- **STOP / opt-out** is built in.
- **Edit or delete leads**, set **follow-up dates**, keep dated **notes**, and
  get a morning email of follow-ups due. Each lead shows its texts, notes,
  follow-up text schedule and full history.
- **Text Log**: every text sent and received, filterable and downloadable.
- **Reports**: leads by day and type, reply, close and opt-out rates,
  texting volume, follow-up performance, and a full activity log.
- **Settings**: agency name, phone numbers, logos, lead email recipients,
  every text's wording (with **AI writing help**), the assistant's instructions,
  and texting hours.

**Setup:** see **[docs/SETUP.md](docs/SETUP.md)**. It covers connecting
SmartFinancial, choosing and registering a texting service (with prices),
email, AI, and testing.

## For developers

Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage) + Tailwind,
deployed on Vercel. Texting via Twilio or Telnyx REST APIs; email via Resend;
AI via the Anthropic SDK.

```bash
npm install
cp .env.example .env.local   # fill in
npm run dev
npm test                     # lead parser tests (SmartFinancial samples)
npm run typecheck
```

| Path | What |
|---|---|
| `supabase/migrations/0001_init.sql` | Tables, access rules, starter follow-ups, logo bucket |
| `supabase/migrations/0002_notes_and_activity.sql` | Lead notes + activity log (database triggers) |
| `lib/fields.ts` | Lead types and every field/section (drives forms, emails, AI context) |
| `lib/parse-lead.ts` | Reads SmartFinancial leads (JSON, form, text or HTML email) |
| `lib/ingest.ts` | Save/dedupe a lead → email → welcome text |
| `lib/bot.ts` | AI texting assistant |
| `lib/followups.ts` | Scheduled job: morning welcome texts, follow-ups, digest email |
| `app/api/webhooks/smartfinancial` | Lead intake (secret key) |
| `app/api/webhooks/sms` | Incoming texts (Twilio/Telnyx signature checked) |
| `app/i/c/[code]`, `app/i/s/[code]` | Public tap-to-call and stop-texts pages |
| `app/api/cron` | Runs every 15 minutes (`vercel.json`) |
