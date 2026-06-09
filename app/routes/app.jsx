import { useState, useEffect } from "react";
import { Outlet, useLoaderData, useRouteError, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import {
  AppProvider as PolarisAppProvider,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Divider,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

function AnalyticsSkeleton() {
  const [progress, setProgress] = useState(6);

  useEffect(() => {
    // Decelerate toward 88%: fast start, slows as it approaches cap (never hits 100%)
    const id = setInterval(() => {
      setProgress((p) => (p >= 88 ? p : p + (88 - p) * 0.14 + 0.5));
    }, 400);
    return () => clearInterval(id);
  }, []);

  return (
    <SkeletonPage title="Analytics">
      <Layout>
        <Layout.Section>
          <BlockStack gap="200">
            <ProgressBar progress={Math.round(progress)} size="small" />
            <Text variant="bodySm" tone="subdued">
              Fetching your store data — this takes a few seconds on large order volumes…
            </Text>
          </BlockStack>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <InlineStack gap="400" blockAlign="end" wrap>
              <BlockStack gap="100">
                <SkeletonBodyText lines={1} />
                <SkeletonDisplayText size="small" />
              </BlockStack>
              <BlockStack gap="100">
                <SkeletonBodyText lines={1} />
                <SkeletonDisplayText size="small" />
              </BlockStack>
            </InlineStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <BlockStack gap="300">
                  <SkeletonBodyText lines={1} />
                  <SkeletonDisplayText size="large" />
                  <SkeletonBodyText lines={2} />
                  <Divider />
                  <SkeletonBodyText lines={3} />
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
        <Layout.Section>
          <BlockStack gap="200">
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={1} />
          </BlockStack>
        </Layout.Section>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <BlockStack gap="300">
                  <SkeletonBodyText lines={1} />
                  <SkeletonDisplayText size="large" />
                  <SkeletonBodyText lines={2} />
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const navigation = useNavigation();

  const isAnalyticsLoading =
    navigation.state === "loading" &&
    navigation.location?.pathname === "/app/analytics";

  console.log("[app.jsx] nav.state:", navigation.state, "| pathname:", navigation.location?.pathname, "| showSkeleton:", isAnalyticsLoading);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <s-app-nav>
          <s-link href="/app">Home</s-link>
          <s-link href="/app/analytics">Analytics</s-link>
          <s-link href="/app/scope-test">Scope Test</s-link>
          <s-link href="/app/debug">Debug</s-link>
        </s-app-nav>
        {isAnalyticsLoading ? <AnalyticsSkeleton /> : <Outlet />}
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
