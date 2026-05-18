import prisma from "../db.server";

const API_VERSION = "2025-10";
const WELCOME_CODE = "WELCOME10";
const SHOP_DOMAIN = process.env.SHOP_DOMAIN || "rinfit.myshopify.com";

/**
 * Subscribe an email address to Shopify email marketing.
 * Reads the admin session token from the DB, then creates or updates the customer
 * with emailMarketingConsent=SUBSCRIBED. Including consentUpdatedAt triggers
 * Shopify's "Customer subscribed to email marketing" welcome automation.
 *
 * @param {string} email
 * @returns {{ success: true } | { alreadySubscribed: true }}
 */
export async function subscribeEmailToMarketing(email) {
  console.log(`[subscribe] start email=${email} shop=${SHOP_DOMAIN}`);

  const session = await prisma.session.findFirst({
    where: { shop: SHOP_DOMAIN, isOnline: false },
    orderBy: { expires: "desc" },
  });
  if (!session) throw new Error(`No admin session found for ${SHOP_DOMAIN}`);
  console.log(`[subscribe] session scope=${session.scope}`);

  const { shop, accessToken } = session;

  const consentInput = {
    emailMarketingConsent: {
      marketingState: "SUBSCRIBED",
      marketingOptInLevel: "SINGLE_OPT_IN",
      consentUpdatedAt: new Date().toISOString(),
    },
  };

  // Look up existing customer
  const searchResult = await shopifyGql(shop, accessToken, `
    query($q: String!) {
      customers(first: 1, query: $q) {
        edges { node { id emailMarketingConsent { marketingState } } }
      }
    }
  `, { q: `email:${email}` });

  console.log(`[subscribe] search result:`, JSON.stringify(searchResult?.data?.customers?.edges));

  const existing = searchResult.data?.customers?.edges?.[0]?.node ?? null;

  if (existing) {
    const state = existing.emailMarketingConsent?.marketingState;
    console.log(`[subscribe] existing customer id=${existing.id} marketingState=${state}`);

    if (state === "SUBSCRIBED") {
      console.log(`[subscribe] already subscribed → returning coupon`);
      return { alreadySubscribed: true, coupon: WELCOME_CODE };
    }

    console.log(`[subscribe] updating consent to SUBSCRIBED`);
    const updateResult = await shopifyGql(shop, accessToken, `
      mutation($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer { id emailMarketingConsent { marketingState } }
          userErrors { field message }
        }
      }
    `, { input: { id: existing.id, ...consentInput } });

    const errors = updateResult.data?.customerUpdate?.userErrors;
    console.log(`[subscribe] update result customer=${JSON.stringify(updateResult.data?.customerUpdate?.customer)} errors=${JSON.stringify(errors)}`);
    if (errors?.length > 0) throw new Error(JSON.stringify(errors));
  } else {
    console.log(`[subscribe] no existing customer → creating`);
    const createResult = await shopifyGql(shop, accessToken, `
      mutation($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id email emailMarketingConsent { marketingState } }
          userErrors { field message }
        }
      }
    `, { input: { email, tags: ["fromchat"], ...consentInput } });

    const errors = createResult.data?.customerCreate?.userErrors;
    console.log(`[subscribe] create result customer=${JSON.stringify(createResult.data?.customerCreate?.customer)} errors=${JSON.stringify(errors)}`);
    if (errors?.length > 0) throw new Error(JSON.stringify(errors));
  }

  console.log(`[subscribe] done → coupon=${WELCOME_CODE}`);
  return { success: true, coupon: WELCOME_CODE };
}

async function shopifyGql(shop, token, query, variables = {}) {
  const res = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`[subscribe] shopify http error status=${res.status} body=${body}`);
    throw new Error(`Shopify Admin API ${res.status}: ${body}`);
  }
  const json = await res.json();
  if (json.errors) {
    const msg = json.errors.map(e => e.message).join("; ");
    console.error(`[subscribe] shopify graphql errors:`, JSON.stringify(json.errors));
    throw new Error(msg);
  }
  return json;
}
