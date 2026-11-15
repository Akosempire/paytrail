# WhatsApp to invoice: setup

Businesses on paid plans (and the free trial) link their WhatsApp number and run their invoicing from a chat: make quotes and invoices, see who owes them, mark invoices paid, send documents and receipts to customers. Nothing goes to a customer and no payment is recorded until the owner replies **YES**.

## 1. Database
Run `supabase/RUN_NEW_2026-11-14a.sql` in Supabase → SQL Editor.

## 2. Twilio (Admin → Integrations → WhatsApp)
1. Sign up at twilio.com. Copy the **Account SID** and **Auth Token** from the Console home page.
2. Testing: Messaging → Try it out → Send a WhatsApp message. Use the Sandbox number **+1 415 523 8886**; every tester first sends the join code shown there from their phone.
3. Live: Messaging → Senders → WhatsApp senders → register your own number (Twilio walks you through Meta's business verification).
4. Paste SID, token and the bot's number in Admin → Integrations → WhatsApp → **Connect Twilio**. It's checked with Twilio before saving; the token is stored encrypted.

## 3. Webhook
Copy the address shown on the page (`https://usetally.cc/api/whatsapp/webhook`) into:
- Sandbox: Sandbox settings → **When a message comes in**, method POST.
- Own number: WhatsApp senders → your number → **Webhook URL for incoming messages**, method POST.

Every request is checked against Twilio's signature, so only Twilio can use it.

## 4. Customer templates (needed to message customers first)
In Twilio → Messaging → Content Template Builder, create three **Text** templates, category **Utility**, using the exact text shown on the admin page (Invoice, Quote, Receipt). Submit each for WhatsApp approval, then paste the **Content SIDs** (HX…) and select **Save templates**. **Check approval** shows each template's status.

Variables: {{1}} customer name, {{2}} business name, {{3}} e.g. "invoice INV-0042", {{4}} amount, {{5}} the document's private link code.

Without approved templates the bot still works: the owner gets a tap-to-send link that opens their own WhatsApp with the message ready to go to the customer.

## 5. AI (optional, free providers only)
Paste a free API key in Admin → Integrations → WhatsApp → AI. The provider is recognised from the key, the models that key can use are loaded, and the best one for the bot is pre-selected (★). Select **Save and check**.

- **Google Gemini**: aistudio.google.com → Get API key (key starts `AIza`). Use a Flash model.
- **Groq**: console.groq.com → API Keys, no card (key starts `gsk_`).
- **NVIDIA**: build.nvidia.com → pick a model → Get API Key (key starts `nvapi-`; about 40 requests a minute).
- **DeepSeek (via OpenRouter)**: openrouter.ai → Keys → Create key (key starts `sk-or-`). Only the free models (ending `:free`) are listed; about 50 messages a day without credit. Needs RUN_NEW_2026-11-15b.sql.

Free tiers limit messages per minute and per day, and the provider may use what's sent to improve its models. Without AI the bot uses numbered menus and short commands (`menu`, `paid INV-0042 50000`, `send INV-0042`, `receipt INV-0042`, `convert QT-0007`). The AI can only read and make drafts; sending, payments, converting and voiding always wait for YES.

## 6. Switch on
Turn on **Answer messages**. Businesses then link a number in Settings → WhatsApp (a 10-minute one-time code they send to the bot). The owner gets an email when a number is linked.

## Notes
- Paid feature `whatsapp`: ticked by default on paid plans; untick it per plan in Admin → Plans.
- Limits: 40 messages per number per 10 minutes; 8 link tries per hour from an unlinked number.
- Message text is kept 30 days (the daily job blanks it).
- Customers who reply to the bot are told how to reach the business directly.
- Costs: Twilio charges per message plus Meta's per-conversation fee; the AI provider charges per message handled.
