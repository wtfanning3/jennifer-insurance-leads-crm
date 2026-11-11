# Setup guide

This walks through everything once, in order: about 1–2 hours of clicking,
plus a few days' wait for texting registration (step 5). Nothing here needs
programming.

| Step | What | Cost |
|---|---|---|
| 1 | Supabase (database + sign-in) | Free |
| 2 | Vercel (runs the CRM) | Pro $20/mo (see note) |
| 3 | Resend (sends the lead emails) | Free up to 3,000 emails/mo |
| 4 | Anthropic (AI assistant + AI writing help) | Pay per use, see below |
| 5 | Texting: Twilio or Telnyx | See "Texting: which service and what it costs" |
| 6 | SmartFinancial → the CRM | Free |
| 7 | Test it end to end | — |

---

## 1. Supabase (database and sign-in)

1. Go to [supabase.com](https://supabase.com) → **New project**. Name it
   `jrf-leads-crm`. Pick a strong database password and the region closest to
   Colorado (e.g. *West US*).
2. Left menu → **SQL Editor** → **New query**. Open
   `supabase/migrations/0001_init.sql` from this repository, paste the whole
   file in and click **Run**. This creates the tables, the starter follow-up
   texts, your agency settings and the logo storage. Then do the same with
   `supabase/migrations/0002_notes_and_activity.sql` (notes on each lead, and
   the activity tracking used by History and Reports).
3. **Authentication → Providers → Email**: turn **off** "Allow new users to
   sign up" (only people you add can get in).
4. **Authentication → Users → Add user**: add Jennifer's email and a
   password (tick "Auto confirm"). Add any staff the same way.
5. **Project Settings → API**: keep this page open; you need the
   *Project URL*, the *anon public* key and the *service_role* key in step 2.

## 2. Vercel (runs the CRM)

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import
   the GitHub repository `jennifer-insurance-leads-crm`.
2. Before clicking Deploy, open **Environment Variables** and add these
   (`.env.example` lists every one):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase *anon public* key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase *service_role* key |
   | `SMARTFINANCIAL_WEBHOOK_SECRET` | A long random string, e.g. from [this generator](https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new). |
   | `CRON_SECRET` | Another, different long random string |

   (Email, AI and texting keys get added in steps 3–5; you can redeploy after.)
3. Click **Deploy**. When it's done, note the address (e.g.
   `https://jennifer-insurance-leads-crm.vercel.app`), add it as
   `NEXT_PUBLIC_APP_URL`, and redeploy (**Deployments → ⋯ → Redeploy**).
4. Optional: **Settings → Domains** to use your own address, e.g.
   `leads.yourdomain.com`. A short domain makes the links inside texts shorter.
5. Sign in at your address with the user from step 1.4. Go to **Settings**
   and fill in the agency info, the **office phone** (the "tap to call"
   link rings it), and the **Lead emails** addresses.

> **Why Vercel Pro:** the follow-up texts and morning welcome texts run on a
> schedule every 15 minutes (`vercel.json`). Vercel's free Hobby plan only runs
> scheduled jobs once a day and is for non-commercial use. If you'd rather stay
> on Hobby, change the schedule in `vercel.json` to once a day
> (`0 15 * * *`), and use a free service such as
> [cron-job.org](https://cron-job.org) to call
> `https://<your CRM>/api/cron` every 15 minutes with the header
> `Authorization: Bearer <your CRON_SECRET>`.

## 3. Resend (sends the lead emails)

1. Sign up at [resend.com](https://resend.com) → **Domains → Add domain** →
   add the agency's domain and add the DNS records it shows (wherever the
   domain is managed). Wait for "Verified".
2. **API Keys → Create** → copy it.
3. In Vercel add `RESEND_API_KEY` and
   `EMAIL_FROM` = `Leads CRM <leads@youragencydomain.com>`, then redeploy.

Every new lead is emailed to **each** address in Settings → Lead emails (one
email per address, with every detail of the lead and a button to open it).
Replies from leads are emailed too, and there's a morning email listing the
follow-ups due that day.

> If the agency doesn't have its own domain (only a farmers.com email), buy an
> inexpensive one just for sending (e.g. `jrfinsurance.com`, about $12/yr).
> You can't verify farmers.com in Resend.

## 4. Anthropic (AI)

1. [console.anthropic.com](https://console.anthropic.com) → sign up → **Billing**:
   add a card and a small credit (e.g. $20). Set a monthly limit under
   **Limits** if you like.
2. **API Keys → Create key** → add it in Vercel as `ANTHROPIC_API_KEY`, redeploy.

What it costs (approximate, from Anthropic's published prices):

| | Per assistant reply | 1,000 replies/month |
|---|---|---|
| Default model (Claude Opus 5.5) | ~2¢ | ~$20 |
| `AI_MODEL=claude-haiku-5-5` | ~0.1¢ | ~$1 |

"AI help" writing in Settings and on leads is a few cents a day at most.

---

## 5. Texting: which service and what it costs

The CRM works with **Twilio** or **Telnyx**. Both sell plain business texting
at cost per message. The all-in-one texting apps (SimpleTexting, Textedly,
etc., $30–$100+/mo) don't let another system, like this CRM, run an automatic
chatbot through them, so they don't fit here.

**My recommendation: Twilio.** It costs a little more per text than Telnyx, but
it's the most widely used. Its setup screens and registration help are the
easiest to follow, and it handles STOP/HELP replies for you. Pick **Telnyx**
if keeping the monthly bill as low as possible matters more.

Prices (US, standard local number, late 2026; check each site before you
sign up, as they change):

| | Twilio | Telnyx |
|---|---|---|
| Phone number | ~$1.15/mo | ~$1.10/mo |
| Each text sent (per 160-character part) | $0.0083 | $0.004 |
| Each text received | $0.0083 | Free |
| Carrier fees (passed through, both) | ~$0.003–0.005 per text | ~$0.003 per text |
| Texting registration ("A2P 10DLC", one time) | ~$4.50 brand + $15 campaign review | about the same |
| Registration monthly fee | ~$1.50–$10/mo | ~$1.50–$10/mo |

**Example month, 300 leads**: each gets a welcome text and up to 3
follow-ups (≈ 8 text parts), and about half reply and chat with the assistant
(≈ 8 more parts each). That's about 3,600 parts:
- Twilio: roughly **$45–$55/month** all in
- Telnyx: roughly **$25–$35/month** all in

### Registration (required, both services)

US carriers require every business that texts from a regular phone number to
register first ("A2P 10DLC"). Unregistered texts get blocked. It takes a
few days to about 2 weeks. You'll be asked for:
- Legal business name, EIN, address and website (use the agency's details).
- **Campaign type: "Customer Care" or "Mixed"**, with a description like
  *"Follow-up texts to consumers who requested an insurance quote through
  SmartFinancial and agreed to be contacted, plus answers to their replies."*
- **Sample messages**: copy your welcome text and one follow-up from
  Settings.
- **How people opt in**: *"Consumers submit a quote request on SmartFinancial
  and consent to be contacted by text by insurance agents."* SmartFinancial
  can tell you their exact consent wording; ask for it in step 6 and paste it in.
- Opt-out: *"Reply STOP to any message; every first message says so."*

> **Before you text leads, check with Farmers.** Farmers agents usually
> have to follow Farmers' rules for marketing and texting (approved wording,
> approved vendors, record keeping). Ask your district manager or Farmers
> agency compliance whether texting leads through Twilio/Telnyx with this
> CRM is allowed, and whether specific wording is required. You can change
> every text in Settings to match.

### Twilio setup

1. Sign up at [twilio.com](https://www.twilio.com) → upgrade the account
   (add a card).
2. **Phone Numbers → Buy a number**: pick a 970 (Fort Collins) local number
   with SMS.
3. **Messaging → Regulatory compliance / A2P 10DLC**: register the brand and
   the campaign (see above). Add the number to the campaign's Messaging Service.
4. **Phone Numbers → your number → Messaging configuration**: "A message
   comes in" → **Webhook**, `https://<your CRM>/api/webhooks/sms`, **HTTP POST**.
   (If the number is in a Messaging Service, set this on the Messaging
   Service's *Integration* page instead: "Send a webhook" with the same address.)
5. In Vercel add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (Console home
   page) and `TWILIO_FROM_NUMBER` (e.g. `+19705551234`), then redeploy.

### Telnyx setup (instead of Twilio)

1. Sign up at [telnyx.com](https://telnyx.com), add a payment method.
2. **Messaging → Create messaging profile**. Under *Inbound*, set the webhook
   URL to `https://<your CRM>/api/webhooks/sms` (API v2).
3. **Numbers → Buy numbers**: a 970 local number; assign it to the profile.
4. **Messaging → 10DLC**: register brand and campaign (see above), then
   assign the number.
5. In Vercel add `TELNYX_API_KEY` (*API Keys*), `TELNYX_FROM_NUMBER`,
   `TELNYX_PUBLIC_KEY` (*Account Settings → Keys & Credentials → Public Key*),
   and optionally `TELNYX_MESSAGING_PROFILE_ID`. Redeploy.

### How texting works in the CRM

- **Welcome text**: the moment a lead arrives. If it's outside texting hours
  (Settings → Texting hours, default 8 AM–8 PM Mountain), it goes out when
  texting hours start. Different wording per lead type (Settings → Welcome text).
- **Tap-to-call link**: `{call_link}` in any text opens a page with the
  agency logo that dials the office number (Settings → Agency). You can set a
  different number per lead type, or per lead. The lead page shows when they
  tapped it.
- **Follow-up texts**: Settings → Follow-up texts. Add, remove and reword
  them, pick the day and time, and which lead types get each. They stop
  automatically once the lead replies, is marked Quoted/Sold/Lost, or opts out.
- **AI assistant**: answers lead replies right away. It never gives prices,
  never asks for SSNs or card numbers, and hands the conversation to you
  (pauses itself and emails you "Needs you") when they're ready to buy,
  upset, ask for a person, or ask something it shouldn't answer. Turn it off
  for one lead, or for everyone.
- **Opting out**: every first text says "Reply STOP to opt out". STOP (and
  UNSUBSCRIBE, CANCEL, END, QUIT) stops all texts to that lead immediately.
  `{stop_link}` adds a tap-to-unsubscribe link if you want one as well. START
  turns texts back on. HELP gets the office number.

---

## 6. SmartFinancial → the CRM

The CRM has an address that takes leads in, and accepts them two ways. Ask
SmartFinancial for the first one; the second works with any lead source that
can email you.

**Your lead address** (Settings → Connections & testing shows it):

```
https://<your CRM>/api/webhooks/smartfinancial?key=<SMARTFINANCIAL_WEBHOOK_SECRET>
```

### Option A (best): SmartFinancial posts each lead straight to the CRM

Call SmartFinancial agent support (**877-323-7750**) or your account rep and
say:

> "I'd like my leads delivered to my CRM by **HTTP POST / webhook** in real
> time, in addition to email. Here's the URL: *(your lead address above)*.
> JSON is preferred, but form posts or plain text also work. Auto, home,
> renters and commercial only. Can you also send me your TCPA consent
> wording for text messages?"

That's all they need. The CRM reads their field names automatically (any
style: `first_name`, `FirstName`, "First Name", nested driver and vehicle
lists), and anything it doesn't recognize is still saved under *Other
Information* on the lead, so nothing is lost. Life and health leads are
ignored. If they say they can only post to specific CRMs, ask if they support a
"custom post" or "generic HTTP post". Most lead vendors do.

### Option B: forward the SmartFinancial lead emails

If SmartFinancial can only email leads, have those emails turned into a post to
the CRM. Any of these works:

- **CloudMailin** ([cloudmailin.com](https://www.cloudmailin.com), has a free
  starter plan): create an address, set its target to your lead address,
  format **JSON (Normalized)**. Then in your email (or SmartFinancial's lead
  delivery settings) send/forward the lead emails to the CloudMailin address.
- **Zapier** (paid plan, ~$20–30/mo): Trigger *Email by Zapier → New Inbound
  Email*; Action *Webhooks by Zapier → POST* to your lead address, with a
  data field `text` = *Body Plain*.
- **Mailparser.io**: forward the emails there and set a webhook to your lead
  address.

The CRM reads the lead email's "Name … Phone …", "Existing Coverage",
"Driver #1", "Vehicle #1", "Home Details", "Business Information" layout.
That's the same layout as SmartFinancial's sample leads, and the tests check it.

> If the lead email doesn't say what kind of lead it is, add `&type=auto`
> (or `home`, `renters`, `commercial`) to the end of the lead address.

### Duplicates

If SmartFinancial sends the same lead twice (same lead id, or the same phone
and type within 24 hours), the CRM fills in anything new on the existing
lead. It doesn't create a second one or text them again.

---

## 7. Test it end to end

1. **Settings → Connections & testing**: everything should show ✔.
2. **Send a test lead**: pick Auto, put **your own cell number**, click *Send
   test lead*. Within seconds:
   - it appears under **Leads** with every section filled in,
   - the lead email arrives at each address in Settings → Lead emails,
   - your phone gets the welcome text. Tap the call link, then text back a
     question and watch the assistant answer (and the reply email arrive).
3. Reply **STOP** to make sure opting out works (the lead page shows
   "Opted out"). Delete the test lead when you're done.
4. Ask SmartFinancial to send a test lead to your address (Option A) or
   forward a real lead email (Option B), and check it the same way.

## Everyday use

- **Dashboard**: new leads, unread texts, conversations the assistant handed
  to you, follow-ups due.
- **Leads**: filter by type (Auto / Home / Renters / Commercial) and status,
  search by name, phone or email, or add a lead by hand.
- **Lead page**: call/email/map links, the text conversation (type a reply,
  or use ✨ AI help to draft one), every field from the lead (edit, then
  *Save changes*), status, follow-up date (+1d, +7d… buttons), notes, the
  assistant/follow-up switches, and **Delete lead**.
- **Lead page, also**: **Notes**, a dated log (who wrote it and when; edit or
  delete any note). **Follow-up texts** shows which went out, which are
  planned and which won't send (and why). **History** lists everything that
  happened to the lead.
- **Conversations**: every lead you're texting with, unread first.
- **Text Log**: every text sent and received. Filter by dates,
  sent/received, kind (welcome, follow-up, assistant, staff), lead type, or
  failed only; search; download as a spreadsheet.
- **Reports**: pick the dates (today, 7/30/90 days, this or last month,
  this year, all time, or custom). It shows leads received over time, by
  type, and where they are now; reply rate, call-link taps, quoted/sold and
  close rate per type; texts sent by kind; welcome-text speed; how each
  follow-up text performs; opt-outs and hand-offs; where leads came from; and
  a full activity log. Download the leads or the activity log as a spreadsheet.
- **Settings**: agency name, phone numbers, logos (upload new ones any time),
  who gets lead emails, welcome and follow-up wording (with AI help on every
  box: *Tell AI* what you want, or *Improve / Shorter / Friendlier…*, or open
  the request in ChatGPT/Claude), the assistant's instructions, and texting hours.
