# Order Assistance Feature — Test Steps

Test URL: `https://www.rinfit.com/?preview_theme_id=186125746464`

Prerequisites:
- Test customer account: `nezhihai@gmail.com` with at least one placed order in Shopify admin
- Chat bubble visible on the page (debug strip shows token status)

---

## 1. Full auth flow (cold start — no token)

1. Open the test URL in a fresh private/incognito window (clears localStorage)
2. Open the chat bubble
3. Click **"Order Assistance"** in the starter menu
4. Sub-menu appears: Track Order / Start a Return / Damaged or Defective Item / Wrong Item Received
5. Click **"Track Order"**
6. Auth gate appears: "Sign in to continue" with **[Continue to sign in]** and **[Go back]** buttons
7. Click **[Continue to sign in]**
8. A popup opens to Shopify's login page (`shopify.com/authentication/...`)
9. Log in as `nezhihai@gmail.com`
10. Popup closes automatically
11. Chat sends the pending message and Claude responds with real order details (order number, status, tracking if available)
12. Debug strip shows `token: ✓ expires HH:MM:SS`

Expected: Order details displayed without error. No "no orders found."

---

## 2. Pre-authenticated flow (token already valid)

1. Continue from test 1 (token is stored in localStorage)
2. Refresh the page (same window, not incognito)
3. Open the chat bubble
4. Click **"Order Assistance"** → **"Track Order"**
5. Auth gate should be **skipped** — chat message sent directly
6. Claude responds with order details immediately

Expected: No auth popup shown when token is still valid.

---

## 3. "See last conversation" button

1. After completing test 1 or 2, close the chat
2. Reload the page
3. Open the chat bubble — starters are shown
4. **"See last conversation"** button should appear above the starters
5. Click it — previous conversation messages load

Expected: Button appears only when a valid token + conversationId exist in localStorage.

---

## 4. [Go back] button on auth gate

1. Fresh incognito window → open chat → Order Assistance → Track Order
2. Auth gate appears
3. Click **[Go back]**
4. Sub-menu reappears (or starters — whichever is appropriate)

Expected: No broken state; user can navigate freely.

---

## 5. Return request flow

1. Authenticated session (from test 2, or re-auth)
2. Click **"Order Assistance"** → **"Start a Return"**
3. Claude calls `request_return` tool (check debug strip conversation ID, then check Fly logs)
4. Claude responds with escalation summary: `Order #[number] · Item: [product] · Issue: Return request`

Expected: Escalation summary format, no automated return initiated.

---

## 6. Damaged/wrong item flows

1. Authenticated session
2. Click **"Order Assistance"** → **"Damaged or Defective Item"**
3. Claude responds with escalation summary including the damage issue
4. Repeat for **"Wrong Item Received"**

Expected: Both flows produce a pre-filled support escalation message.

---

## 7. Free-form order query

1. Authenticated session
2. Type a free-form message: `"Where is my order?"`
3. Claude calls `get_most_recent_order_status` and responds with order details

Expected: Works without using the structured quick-reply flow.

---

## 8. Token expiry (manual test)

1. In browser DevTools console: `localStorage.setItem('shopAiTokenExpiry', Date.now() - 1000)`
2. Reload page → open chat → Order Assistance → Track Order
3. Auth gate should appear again (token treated as expired)

Expected: Auth re-triggered when localStorage expiry is in the past.

---

## Cleanup checklist (before switching to main theme)

- [ ] Remove `maybeInitDebugStrip()` call and function from `extensions/chat-bubble/assets/chat.js`
- [ ] Remove or restrict `/app/debug/mcp` admin route if not needed for production
- [ ] Confirm debug strip is not visible to real customers
