# Fly.io Account Migration - Step-by-Step Guide

## Current Status: Ready to Start

---

## STEP 1: Authenticate to New Fly.io Account

```bash
flyctl auth login
```

**What this does:** Opens browser to log into the new Fly.io account.

**Verification:** Run `flyctl auth whoami` to confirm you're logged into the correct account.

---

## STEP 2: Create New Fly.io App

```bash
flyctl apps create
```

**What this does:** Creates a new app. Fly.io will suggest a name based on your directory.

**Expected output:** Something like "Created app shop-chat-agent-xyz-1234 in organization..."

**Action required:**
1. Note the generated app name (e.g., `shop-chat-agent-xyz-1234`)
2. Update `fly.toml`:
   - Uncomment line 2 and set: `app = 'shop-chat-agent-xyz-1234'`
   - Update line 14: `SHOPIFY_APP_URL = 'https://shop-chat-agent-xyz-1234.fly.dev'`

---

## STEP 3: Create Persistent Volume

```bash
flyctl volumes create data --region ams --size 10
```

**What this does:** Creates a 10GB volume in Amsterdam for SQLite database storage.

**Expected output:** "Created volume vol_xxx in the ams region"

**Note:** The volume auto-extends from 1GB to 10GB as needed (configured in fly.toml).

---

## STEP 4: Register New Shopify App

### In Shopify Partner Dashboard (https://partners.shopify.com):

1. **Create App:**
   - Click "Apps" → "Create app"
   - Choose "Public app" or "Custom app"
   - App name: "Shop Chat Agent" (or your preferred name)

2. **Note Credentials:**
   - Client ID: `____________________________________` (save this)
   - Client secret: `____________________________________` (save this)

3. **Configure URLs:**
   - App URL: `https://[your-app-name].fly.dev`
   - Allowed redirection URL(s):
     - `https://[your-app-name].fly.dev/auth/callback`
     - `https://[your-app-name].fly.dev/api/auth/callback`

4. **Set Scopes (API access):**
   Under "Configuration" → "Scopes":
   - ✅ `customer_read_customers`
   - ✅ `customer_read_orders`
   - ✅ `customer_read_store_credit_account_transactions`
   - ✅ `customer_read_store_credit_accounts`
   - ✅ `unauthenticated_read_product_listings`

5. **Save Configuration**

---

## STEP 5: Set Fly.io Secrets

Replace the placeholder values with your actual credentials:

```bash
# Required: Claude API Key
flyctl secrets set CLAUDE_API_KEY="sk-ant-api03-your-actual-key-here"

# Required: Shopify App Credentials (from Step 4)
flyctl secrets set SHOPIFY_API_KEY="your-client-id-from-step-4"
flyctl secrets set SHOPIFY_API_SECRET="your-client-secret-from-step-4"
```

**What this does:** Securely stores environment variables that the app needs at runtime.

**Note:** `SHOPIFY_APP_URL`, `SCOPES`, and `PORT` are already in `fly.toml`, so you don't need to set them as secrets.

### Optional: S3 Backup Configuration

If you want automatic database backups to S3 (recommended for production):

```bash
flyctl secrets set BUCKET_NAME="your-s3-bucket-name"
flyctl secrets set AWS_ACCESS_KEY_ID="your-aws-access-key"
flyctl secrets set AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
flyctl secrets set AWS_ENDPOINT_URL_S3="https://s3.amazonaws.com"
```

**Skip this for now if:** You're just testing or don't have S3 storage set up yet. The app works fine without it.

---

## STEP 6: Deploy to Fly.io

```bash
flyctl deploy
```

**What this does:**
1. Builds Docker image with your app code
2. Uploads to Fly.io
3. Starts the container
4. Runs database migrations (`prisma migrate deploy`)
5. Starts the React Router server

**Expected duration:** 2-5 minutes for first deployment.

**Monitor deployment:**
```bash
flyctl logs
```

**Success indicators:**
- ✅ "Prisma Migrate applied X migrations"
- ✅ "React Router server listening on port 3000"
- ✅ "Health checks passing"

**Common issues:**
- ❌ "Missing CLAUDE_API_KEY" → Go back to Step 5
- ❌ "Volume not found" → Go back to Step 3
- ❌ "App name not set in fly.toml" → Go back to Step 2

---

## STEP 7: Link App to Shopify Store

```bash
# Link to a development/test store
npm run config:link
```

**What this does:** Connects your local Shopify CLI to a store where you can install the app.

**Follow the prompts:**
1. Select the app you created in Step 4
2. Choose a development store (or create one)

**Deploy theme extension:**
```bash
npm run deploy
```

**What this does:** Pushes the chat bubble extension to Shopify.

---

## STEP 8: Install & Configure Theme Extension

### In Shopify Admin for your test store:

1. **Navigate to:**
   - Online Store → Themes → Customize (on your active theme)

2. **Add Chat Block:**
   - Click "Add section" or "Add block"
   - Search for "Chat Assistant" or "Shop Chat Agent"
   - Add it to your theme (typically in the footer or as a sticky element)

3. **Configure Settings:**
   - **Welcome Message:** "Hi! How can I help you today?"
   - **Bubble Color:** #0A7CFF (or your brand color)
   - **System Prompt:** Standard Assistant or Enthusiastic Assistant

4. **Save & Publish Theme**

---

## STEP 9: Update Local .env File

Edit `C:\projects\shop-chat-agent\.env`:

```env
CLAUDE_API_KEY=sk-ant-api03-your-actual-key
REDIRECT_URL=https://localhost:3458/auth/callback
SHOPIFY_API_KEY=your-client-id-from-step-4
```

**What this does:** Configures your local development environment to match the deployed app.

---

## STEP 10: Test the Deployment

### A. Check App Health

```bash
flyctl status
flyctl logs
```

**Look for:**
- ✅ Status: running
- ✅ Health checks: passing
- ✅ No error messages in logs

### B. Test Chat Widget

1. **Visit Storefront:**
   - Open your test store in a browser
   - You should see the chat bubble in the bottom right

2. **Send Test Message:**
   - Click the chat bubble
   - Type: "Show me your products"
   - Expected: Claude responds with product recommendations

3. **Test Product Search:**
   - Type: "Do you have rings?"
   - Expected: Claude searches and shows product cards

### C. Test Customer Account Flow

1. **Trigger Auth:**
   - Type: "What are my recent orders?"
   - Expected: Popup opens asking to log in

2. **Complete Login:**
   - Log in with a test customer account
   - Expected: Popup closes, chat resumes

3. **Verify Order Data:**
   - Expected: Claude shows your order history

### D. Verify Database Persistence

1. **Send Multiple Messages:**
   - Have a conversation with 5+ messages

2. **Check Logs:**
```bash
flyctl logs | grep -i "conversation"
```
   - Expected: See database write confirmations

3. **Restart App:**
```bash
flyctl apps restart
```
   - Then reload storefront and click chat bubble
   - Expected: Conversation history is preserved

---

## VERIFICATION CHECKLIST

- [ ] Fly.io app deployed and running
- [ ] Health checks passing
- [ ] Chat bubble visible on storefront
- [ ] Can send messages and receive responses
- [ ] Product search works (shows product cards)
- [ ] Customer auth flow completes successfully
- [ ] Order history retrieval works
- [ ] Conversation history persists after app restart
- [ ] No errors in `flyctl logs`

---

## ROLLBACK PLAN

If something goes wrong:

1. **Original deployment is untouched** (different Fly.io account)
2. **To delete new deployment:**
   ```bash
   flyctl apps destroy your-new-app-name
   flyctl volumes destroy vol_xxx
   ```

3. **No data loss** (we're starting with a fresh database)

---

## HELPFUL COMMANDS

```bash
# Check app status
flyctl status

# View live logs
flyctl logs

# Restart app
flyctl apps restart

# SSH into container
flyctl ssh console

# Check database (from inside SSH)
sqlite3 /data/dev.sqlite
.tables
.quit

# Check volume usage
flyctl volumes list

# View app details
flyctl info

# Open app in browser
flyctl open
```

---

## NEXT STEPS AFTER SUCCESSFUL MIGRATION

1. **Production Considerations:**
   - [ ] Set up S3 backups (Step 5 optional section)
   - [ ] Configure monitoring/alerting
   - [ ] Test with real customer data
   - [ ] Performance testing with concurrent users

2. **Customize Prompts:**
   - Edit `app/prompts/prompts.json` to refine assistant behavior
   - Test different prompt types

3. **Monitor Costs:**
   - Fly.io: $0/month for this config (within free tier)
   - Claude API: Varies by usage
   - Check: `flyctl billing`

---

## SUPPORT

- Fly.io Docs: https://fly.io/docs
- Shopify App Docs: https://shopify.dev/docs/apps
- Claude API Docs: https://docs.anthropic.com

**Current migration step:** Ready to start Step 1
