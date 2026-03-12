/**
 * Rinfit AI Chatbot QA Test Runner
 *
 * Sends all 29 Q&A questions to the live chat backend via SSE,
 * captures responses, auto-scores each answer, and writes a markdown report.
 *
 * Usage:  node docs/chatbot-test-runner.mjs
 * Output: docs/chatbot-test-report-<timestamp>.md
 */

import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BACKEND_URL = "https://shop-chat-agent-prod.fly.dev";
const CHAT_ENDPOINT = `${BACKEND_URL}/chat`;
const PROMPT_TYPE = "standardAssistant";
const DELAY_MS = 3000; // pause between questions to avoid hammering the server
const TIMEOUT_MS = 60000; // per-question timeout

// ---------------------------------------------------------------------------
// Ground-truth Q&A data (from Rinfit_chatbot_QA - Chatbot Q&A (1).csv)
// ---------------------------------------------------------------------------

const QA_PAIRS = [
  // Category A – Product Knowledge
  {
    id: "A01",
    category: "A",
    theme: "Product Details",
    question: "Ring measurements/Product information",
    expectedKeywords: ["product information", "material", "width", "thickness", "collection"],
    expectedEscalation: false,
    groundTruth:
      'You can find ring measurements and product details such as material, width, and thickness under the "Product Information" section of each collection.',
  },
  {
    id: "A02",
    category: "A",
    theme: "Product Details",
    question: "Can I use Rinfit rings during workouts or sports?",
    expectedKeywords: ["active", "silicone", "safe", "physical activities", "workout", "sport"],
    expectedEscalation: false,
    groundTruth:
      "Rinfit Silicone rings are designed for active lifestyles and are a safe alternative to metal rings during physical activities.",
  },
  {
    id: "A03",
    category: "A",
    theme: "Product Details",
    question: "What is the difference between men's and women's rings?",
    expectedKeywords: ["sizing", "width", "thickness", "style", "same"],
    expectedEscalation: false,
    groundTruth:
      "Men's and women's silicone rings follow the same sizing standards. Differences may apply in width and thickness depending on the style.",
  },
  {
    id: "A04",
    category: "A",
    theme: "Product Details",
    question: "What is the difference between solid and metallic colors?",
    expectedKeywords: ["solid", "metallic", "coating", "silicone", "colored"],
    expectedEscalation: false,
    groundTruth:
      "Solid colors are made from colored silicone, while metallic colors use a metallic-colored silicone base with an additional coating to achieve the metallic effect.",
  },
  {
    id: "A05",
    category: "A",
    theme: "Product Details",
    question: "Where can I see the sizes/colors available?",
    expectedKeywords: ["collection", "product page", "options", "colors", "sizes"],
    expectedEscalation: false,
    groundTruth:
      "You can view the available colors and sizes by opening each collection and selecting the options shown on the product page.",
  },
  {
    id: "A06",
    category: "A",
    theme: "Ring Maintenance",
    question: "How to clean rings",
    expectedKeywords: ["warm water", "soap", "dry", "clean"],
    expectedEscalation: false,
    groundTruth:
      "Silicone rings can be cleaned using warm water and mild soap. Make sure the ring is fully dry before wearing it again.",
  },
  {
    id: "A07",
    category: "A",
    theme: "Size",
    question: "Are your Rinfit Silicone Rings true to size?",
    expectedKeywords: ["true to size", "US", "standard", "measurement"],
    expectedEscalation: false,
    groundTruth:
      "Rinfit silicone rings are true to size and follow the same US measurement standards as traditional metal rings.",
  },
  {
    id: "A08",
    category: "A",
    theme: "Size",
    question: "I am a half size. Which size should I choose?",
    expectedKeywords: ["half size", "size down", "sizing down", "stretch", "half"],
    expectedEscalation: false,
    groundTruth:
      "Our Silicone rings do not have half sizes, as silicone naturally stretches up to half a size with regular wear. If in between sizes, we recommend sizing down.",
  },
  {
    id: "A09",
    category: "A",
    theme: "Size",
    question: "Size doesn't fit",
    expectedKeywords: ["exchange", "30 days", "support@rinfit.com", "size exchange"],
    expectedEscalation: true,
    groundTruth:
      "We offer a one-time size exchange within 30 days from delivery. Please contact us at support@rinfit.com for an exchange.",
  },
  // Category B – Policy & Fulfillment
  {
    id: "B01",
    category: "B",
    theme: "Shipping",
    question: "How long does shipping takes?",
    expectedKeywords: ["1-2 business days", "3", "7", "USPS", "processed"],
    expectedEscalation: false,
    groundTruth:
      "Orders are typically processed within 1-2 business days. Shipping times vary depending on destination and carrier and are estimates, the USPS generally takes 3 to 7 business days to deliver packages.",
  },
  {
    id: "B02",
    category: "B",
    theme: "Shipping",
    question: "Where can I find my tracking information?",
    expectedKeywords: ["email", "tracking", "ships", "confirmation", "carrier"],
    expectedEscalation: false,
    groundTruth:
      "Once your order ships, you will receive a shipping confirmation email with a tracking number linked to the carrier.",
  },
  {
    id: "B03",
    category: "B",
    theme: "Shipping",
    question: "My order hasn't arrived yet.",
    expectedKeywords: ["support@rinfit.com", "order number", "contact", "tracking"],
    expectedEscalation: true,
    groundTruth:
      "If your tracking has not updated or your order is delayed, please contact our support team at support@rinfit.com with your order number so we can assist you.",
  },
  {
    id: "B04",
    category: "B",
    theme: "Shipping",
    question: "Where do you ship from?",
    expectedKeywords: ["Boston", "Massachusetts"],
    expectedEscalation: false,
    groundTruth: "Orders are shipped from our fulfillment facilities in Boston, Massachusetts.",
  },
  {
    id: "B05",
    category: "B",
    theme: "Shipping",
    question: "How much is shipping?",
    expectedKeywords: ["checkout", "shipping cost", "$4", "destination"],
    expectedEscalation: false,
    groundTruth:
      "Shipping costs vary based on destination, carrier, and package weight. The final shipping cost is shown at checkout, and it is usually about $4 within the US.",
  },
  {
    id: "B06",
    category: "B",
    theme: "Shipping",
    question: "Do you ship internationally?",
    expectedKeywords: ["US", "United States", "not", "only", "domestic"],
    expectedEscalation: false,
    groundTruth:
      "As a small family business, unfortunately at the moment we can only ship within the US.",
  },
  {
    id: "B07",
    category: "B",
    theme: "Shipping",
    question: "Do I need to pay for return shipping?",
    expectedKeywords: ["customer", "responsibility", "non-refundable", "return shipping"],
    expectedEscalation: false,
    groundTruth:
      "Return shipping costs are the responsibility of the customer and are non-refundable.",
  },
  {
    id: "B08",
    category: "B",
    theme: "Warranty",
    question: "Warranty replacement (broken/damaged ring)",
    expectedKeywords: ["one-time", "breakage", "tears", "photo", "proof of purchase", "support"],
    expectedEscalation: true,
    groundTruth:
      "We offer a one-time warranty replacement in case of breakage or tears. Please contact our customer support team with a photo of the damaged ring and proof of purchase.",
  },
  {
    id: "B09",
    category: "B",
    theme: "Warranty",
    question: "What is your return policy?",
    expectedKeywords: ["30 days", "unused", "unworn", "original packaging", "proof of purchase"],
    expectedEscalation: false,
    groundTruth:
      "Returns are accepted within 30 days from delivery for unused and unworn items in their original packaging. A valid proof of purchase is required.",
  },
  {
    id: "B10",
    category: "B",
    theme: "Warranty",
    question: "How do I start a return?",
    expectedKeywords: ["support@rinfit.com", "contact", "return instructions"],
    expectedEscalation: true,
    groundTruth:
      "Please contact our support team at support@rinfit.com before returning an item to receive return instructions.",
  },
  {
    id: "B11",
    category: "B",
    theme: "Warranty",
    question: "When will I receive my refund?",
    expectedKeywords: ["original payment", "processing", "refund", "bank"],
    expectedEscalation: false,
    groundTruth:
      "Once your return is received and approved, the refund will be processed to the original payment method. Processing times may vary depending on your bank or card issuer.",
  },
  {
    id: "B12",
    category: "B",
    theme: "Warranty",
    question: "Wrong ring/size received",
    expectedKeywords: ["support@rinfit.com", "replacement", "sorry", "apolog"],
    expectedEscalation: true,
    groundTruth:
      "We're very sorry that you received the wrong size. Please accept our apologies, and allow us to assist you with a replacement. Contact us at support@rinfit.com.",
  },
  // Category C – Custom & B2B
  {
    id: "C01",
    category: "C",
    theme: "Custom Orders",
    question: "Can I choose different color/style combinations for ring sets?",
    expectedKeywords: ["support@rinfit.com", "contact", "custom order"],
    expectedEscalation: true,
    groundTruth:
      "Please contact us at support@rinfit.com, we'd be happy to assist with a custom order.",
  },
  {
    id: "C02",
    category: "C",
    theme: "Wholesale",
    question: "Wholesale request",
    expectedKeywords: ["support@rinfit.com", "wholesale", "email", "working on it"],
    expectedEscalation: true,
    groundTruth:
      "At the moment, we do not have a retailer/wholesale program available, but we are working on it. Please kindly send us an email to support@rinfit.com with the details of your shop.",
  },
  // Category D – General & Edge Cases
  {
    id: "D01",
    category: "D",
    theme: "General",
    question: "Why choose rubber wedding bands?",
    expectedKeywords: ["silicone", "comfort", "flexibility", "safety", "metal", "everyday"],
    expectedEscalation: false,
    groundTruth:
      "Silicone wedding bands offer comfort, flexibility, and added safety compared to traditional metal rings, making them suitable for everyday and active use.",
  },
  {
    id: "D02",
    category: "D",
    theme: "General / Edge Case",
    question: "Ring rash/allergies",
    expectedKeywords: ["hypoallergenic", "silicone", "moisture", "rash", "irritation"],
    expectedEscalation: false,
    groundTruth:
      "Silicone is generally hypoallergenic, meaning it is unlikely to cause an allergic reaction. However, some people may develop ring rash caused by moisture, soap, or sweat trapped under the ring.",
  },
];

// ---------------------------------------------------------------------------
// SSE response fetcher
// ---------------------------------------------------------------------------

async function sendChatMessage(question) {
  const conversationId = `test-${randomUUID()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let fullText = "";
  let hasEndTurn = false;
  let hasError = false;
  let errorMsg = "";

  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Origin: "https://www.rinfit.com",
      },
      body: JSON.stringify({
        message: question,
        conversation_id: conversationId,
        prompt_type: PROMPT_TYPE,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const event = JSON.parse(raw);
          if (event.type === "chunk") fullText += event.chunk || "";
          if (event.type === "end_turn") hasEndTurn = true;
          if (event.type === "error") {
            hasError = true;
            errorMsg = event.error || "unknown error";
          }
        } catch {
          // ignore malformed SSE lines
        }
      }

      if (hasEndTurn) break;
    }
  } catch (err) {
    hasError = true;
    errorMsg = err.message;
  } finally {
    clearTimeout(timer);
  }

  return { text: fullText.trim(), hasEndTurn, hasError, errorMsg };
}

// ---------------------------------------------------------------------------
// Auto-scoring
// ---------------------------------------------------------------------------

/**
 * Simple keyword-based relevance + completeness scorer.
 * Returns dimension scores 0-2 and flags.
 */
function scoreResponse(qa, responseText) {
  const lower = responseText.toLowerCase();
  const scores = {};
  const flags = [];
  const notes = {};

  // Factual Accuracy (FA): keyword presence as proxy
  const foundKeywords = qa.expectedKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
  const kwRatio = foundKeywords.length / qa.expectedKeywords.length;
  if (kwRatio >= 0.75) scores.FA = 2;
  else if (kwRatio >= 0.4) scores.FA = 1;
  else scores.FA = 0;
  notes.FA = `${foundKeywords.length}/${qa.expectedKeywords.length} expected keywords found: [${foundKeywords.join(", ")}]`;
  if (scores.FA === 0) {
    flags.push("CRITICAL_FAIL");
    notes.FA += ` — missing: [${qa.expectedKeywords.filter((k) => !lower.includes(k.toLowerCase())).join(", ")}]`;
  }

  // Completeness (CO): response length + keyword coverage
  const wordCount = responseText.split(/\s+/).length;
  if (wordCount >= 30 && kwRatio >= 0.6) scores.CO = 2;
  else if (wordCount >= 15 && kwRatio >= 0.3) scores.CO = 1;
  else scores.CO = 0;
  notes.CO = `${wordCount} words, ${Math.round(kwRatio * 100)}% keyword coverage`;
  if (scores.CO === 1) flags.push("PARTIAL_ANSWER");

  // Relevance (RE): simple heuristic — if response contains at least 1 expected keyword it's on topic
  scores.RE = foundKeywords.length > 0 ? 2 : (responseText.length > 20 ? 1 : 0);
  notes.RE = foundKeywords.length > 0 ? "On topic" : "Response may be off-topic";

  // Tone (TO): penalize cold/robotic indicators; reward warm language
  const warmWords = ["happy", "glad", "pleasure", "help", "assist", "please", "thank"];
  const coldWords = ["unable", "cannot process", "error", "i don't know", "not available"];
  const warmFound = warmWords.filter((w) => lower.includes(w)).length;
  const coldFound = coldWords.filter((w) => lower.includes(w)).length;
  if (coldFound > 0) scores.TO = 1;
  else if (warmFound >= 1 || responseText.length > 50) scores.TO = 2;
  else scores.TO = 1;
  notes.TO = `warm indicators: ${warmFound}, cold indicators: ${coldFound}`;

  // Hallucination Risk (HA): flag suspicious fabricated specifics
  const suspiciousPhrases = [
    /\$\d+\.\d+/.test(responseText) && !qa.groundTruth.includes("$"), // invented price
    /\d{1,3}%\s*(off|discount)/.test(lower), // invented discount
    /model\s+[A-Z]{2,}\d+/.test(responseText), // invented model numbers
    /sku\s*[:#]?\s*\w+/i.test(responseText), // invented SKUs
    /lifetime\s+warranty/i.test(responseText) && !qa.groundTruth.toLowerCase().includes("lifetime"),
    /free\s+shipping/i.test(lower) && !qa.groundTruth.toLowerCase().includes("free"),
    /24\/7/i.test(lower) && !qa.groundTruth.toLowerCase().includes("24"),
  ];
  const hallucinationCount = suspiciousPhrases.filter(Boolean).length;
  if (hallucinationCount >= 2) {
    scores.HA = 0;
    flags.push("CRITICAL_FAIL", "HALLUCINATION_DETECTED");
    notes.HA = `${hallucinationCount} suspicious claims detected`;
  } else if (hallucinationCount === 1) {
    scores.HA = 1;
    flags.push("HALLUCINATION_DETECTED");
    notes.HA = "1 potentially fabricated claim detected — verify manually";
  } else {
    scores.HA = 2;
    notes.HA = "No obvious fabricated claims detected";
  }

  // Escalation Appropriateness (ES)
  const escalationWords = ["support@rinfit.com", "contact us", "email us", "reach out", "support team"];
  const hasEscalation = escalationWords.some((w) => lower.includes(w.toLowerCase()));
  if (qa.expectedEscalation) {
    if (hasEscalation) { scores.ES = 2; notes.ES = "Correctly escalates to support"; }
    else { scores.ES = 0; flags.push("CRITICAL_FAIL", "ESCALATION_MISSED"); notes.ES = "Expected escalation to support — not found in response"; }
  } else {
    scores.ES = 2;
    notes.ES = "No escalation required for this question";
  }

  // Weighted score calculation
  // Category A: FA×2 + CO×2 + RE + TO + HA + ES  = /18
  // Category B: FA×3 + CO + RE + TO + HA×2 + ES×2 = /20
  // Category C: FA + CO + RE + TO + HA + ES×3     = /16
  // Category D: FA + CO + RE + TO×2 + HA×2 + ES   = /18
  let maxScore, weightedTotal;
  const { FA, CO, RE, TO, HA, ES } = scores;
  switch (qa.category) {
    case "A":
      weightedTotal = FA * 2 + CO * 2 + RE + TO + HA + ES;
      maxScore = 18;
      break;
    case "B":
      weightedTotal = FA * 3 + CO + RE + TO + HA * 2 + ES * 2;
      maxScore = 20;
      break;
    case "C":
      weightedTotal = FA + CO + RE + TO + HA + ES * 3;
      maxScore = 16;
      break;
    case "D":
      weightedTotal = FA + CO + RE + TO * 2 + HA * 2 + ES;
      maxScore = 18;
      break;
    default:
      weightedTotal = FA + CO + RE + TO + HA + ES;
      maxScore = 12;
  }

  const pct = Math.round((weightedTotal / maxScore) * 100);
  const criticalFail = flags.includes("CRITICAL_FAIL");
  const pass = pct >= 70 && !criticalFail;

  // Deduplicate flags
  const uniqueFlags = [...new Set(flags)];

  return { scores, notes, pct, maxScore, weightedTotal, pass, flags: uniqueFlags };
}

// ---------------------------------------------------------------------------
// Report generator
// ---------------------------------------------------------------------------

function buildReport(results, startTime, endTime) {
  const totalMs = endTime - startTime;

  // Overall stats
  const total = results.length;
  const passed = results.filter((r) => r.scoring.pass).length;
  const failed = total - passed;
  const criticalFails = results.filter((r) => r.scoring.flags.includes("CRITICAL_FAIL")).length;
  const hallucinationsDetected = results.filter((r) => r.scoring.flags.includes("HALLUCINATION_DETECTED")).length;
  const escalationMissed = results.filter((r) => r.scoring.flags.includes("ESCALATION_MISSED")).length;
  const partialAnswers = results.filter((r) => r.scoring.flags.includes("PARTIAL_ANSWER")).length;

  // Category scores
  const categories = ["A", "B", "C", "D"];
  const catNames = { A: "Product Knowledge", B: "Policy & Fulfillment", C: "Custom & B2B", D: "General & Edge Cases" };
  const catWeights = { A: 0.30, B: 0.35, C: 0.10, D: 0.25 };
  const catResults = {};
  for (const cat of categories) {
    const catItems = results.filter((r) => r.qa.category === cat);
    const catPct = catItems.length
      ? Math.round(catItems.reduce((s, r) => s + r.scoring.pct, 0) / catItems.length)
      : 0;
    const catPass = catPct >= 75;
    catResults[cat] = { pct: catPct, pass: catPass, count: catItems.length };
  }

  // Overall weighted score
  const overallScore = Math.round(
    categories.reduce((s, c) => s + catResults[c].pct * catWeights[c], 0)
  );
  let verdict;
  if (overallScore >= 80) verdict = "✅ PRODUCTION READY";
  else if (overallScore >= 70) verdict = "⚠️ CONDITIONAL PASS — remediation required";
  else verdict = "❌ REQUIRES REMEDIATION — not production ready";

  const now = new Date();
  const lines = [];

  // Header
  lines.push(`# Rinfit AI Chatbot QA Test Report`);
  lines.push(`**Generated:** ${now.toISOString().slice(0, 19).replace("T", " ")} UTC`);
  lines.push(`**Test duration:** ${(totalMs / 1000).toFixed(1)}s`);
  lines.push(`**Backend:** ${BACKEND_URL}`);
  lines.push(`**Questions tested:** ${total}`);
  lines.push("");

  // Executive summary
  lines.push(`## Executive Summary`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Overall Score | **${overallScore}%** |`);
  lines.push(`| Verdict | ${verdict} |`);
  lines.push(`| Questions Passed | ${passed} / ${total} |`);
  lines.push(`| CRITICAL_FAIL events | ${criticalFails} |`);
  lines.push(`| HALLUCINATION_DETECTED | ${hallucinationsDetected} |`);
  lines.push(`| ESCALATION_MISSED | ${escalationMissed} |`);
  lines.push(`| PARTIAL_ANSWER | ${partialAnswers} |`);
  lines.push("");

  lines.push(`### Category Scores`);
  lines.push("");
  lines.push(`| Category | Name | Score | Status | Pass Threshold |`);
  lines.push(`|---|---|---|---|---|`);
  for (const cat of categories) {
    const { pct, pass, count } = catResults[cat];
    lines.push(`| ${cat} | ${catNames[cat]} | ${pct}% (${count} questions) | ${pass ? "✅ Pass" : "❌ Fail"} | ≥75% |`);
  }
  lines.push("");

  // Category analysis
  lines.push(`## Category Analysis`);
  lines.push("");
  for (const cat of categories) {
    const catItems = results.filter((r) => r.qa.category === cat);
    const { pct, pass } = catResults[cat];
    lines.push(`### Category ${cat} — ${catNames[cat]}`);
    lines.push(`**Score:** ${pct}% | **Status:** ${pass ? "✅ Pass" : "❌ Fail"}`);
    lines.push("");

    const best = [...catItems].sort((a, b) => b.scoring.pct - a.scoring.pct)[0];
    const worst = [...catItems].sort((a, b) => a.scoring.pct - b.scoring.pct)[0];
    if (best) lines.push(`- **Best performing:** ${best.qa.id} — "${best.qa.question}" (${best.scoring.pct}%)`);
    if (worst && worst.qa.id !== best?.qa.id) lines.push(`- **Needs attention:** ${worst.qa.id} — "${worst.qa.question}" (${worst.scoring.pct}%)`);

    const catFails = catItems.filter((r) => !r.scoring.pass);
    if (catFails.length) {
      lines.push(`- **Failed questions:** ${catFails.map((r) => r.qa.id).join(", ")}`);
    }
    lines.push("");
  }

  // Per-question results
  lines.push(`## Per-Question Results`);
  lines.push("");
  lines.push(`| ID | Theme | Score | Pass | FA | CO | RE | TO | HA | ES | Flags |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const { scores, pct, pass, flags } = r.scoring;
    const flagStr = flags.length ? flags.join(", ") : "—";
    lines.push(
      `| ${r.qa.id} | ${r.qa.theme} | ${pct}% | ${pass ? "✅" : "❌"} | ${scores.FA} | ${scores.CO} | ${scores.RE} | ${scores.TO} | ${scores.HA} | ${scores.ES} | ${flagStr} |`
    );
  }
  lines.push("");

  // Detailed per-question breakdown
  lines.push(`## Detailed Results`);
  lines.push("");
  for (const r of results) {
    const { qa, response, scoring } = r;
    lines.push(`### ${qa.id} — ${qa.theme}: "${qa.question}"`);
    lines.push(`**Score:** ${scoring.pct}% | **Result:** ${scoring.pass ? "✅ PASS" : "❌ FAIL"}`);
    if (scoring.flags.length) lines.push(`**Flags:** \`${scoring.flags.join("`, `")}\``);
    lines.push("");

    if (response.hasError) {
      lines.push(`> ⚠️ **Error:** ${response.errorMsg}`);
    } else {
      lines.push(`**Bot response:**`);
      lines.push(`> ${response.text.replace(/\n/g, "\n> ")}`);
    }
    lines.push("");

    lines.push(`**Scoring notes:**`);
    lines.push(`- FA (${scoring.scores.FA}/2): ${scoring.notes.FA}`);
    lines.push(`- CO (${scoring.scores.CO}/2): ${scoring.notes.CO}`);
    lines.push(`- RE (${scoring.scores.RE}/2): ${scoring.notes.RE}`);
    lines.push(`- TO (${scoring.scores.TO}/2): ${scoring.notes.TO}`);
    lines.push(`- HA (${scoring.scores.HA}/2): ${scoring.notes.HA}`);
    lines.push(`- ES (${scoring.scores.ES}/2): ${scoring.notes.ES}`);
    lines.push("");

    lines.push(`**Expected answer (ground truth):**`);
    lines.push(`> ${qa.groundTruth}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Failure analysis
  const failedResults = results.filter((r) => !r.scoring.pass);
  if (failedResults.length) {
    lines.push(`## Failure Analysis`);
    lines.push("");

    const factualFails = failedResults.filter((r) => r.scoring.scores.FA === 0);
    if (factualFails.length) {
      lines.push(`### Factual Accuracy Failures (${factualFails.length})`);
      for (const r of factualFails) {
        lines.push(`- **${r.qa.id}** ("${r.qa.question}"): ${r.scoring.notes.FA}`);
      }
      lines.push("");
    }

    const hallFails = results.filter((r) => r.scoring.flags.includes("HALLUCINATION_DETECTED"));
    if (hallFails.length) {
      lines.push(`### Hallucination Events (${hallFails.length})`);
      for (const r of hallFails) {
        lines.push(`- **${r.qa.id}** ("${r.qa.question}"): ${r.scoring.notes.HA}`);
      }
      lines.push("");
    }

    const escFails = results.filter((r) => r.scoring.flags.includes("ESCALATION_MISSED"));
    if (escFails.length) {
      lines.push(`### Escalation Missed (${escFails.length})`);
      for (const r of escFails) {
        lines.push(`- **${r.qa.id}** ("${r.qa.question}"): ${r.scoring.notes.ES}`);
      }
      lines.push("");
    }

    const partials = results.filter((r) => r.scoring.flags.includes("PARTIAL_ANSWER") && r.scoring.scores.FA > 0);
    if (partials.length) {
      lines.push(`### Partial Answers (${partials.length})`);
      for (const r of partials) {
        lines.push(`- **${r.qa.id}** ("${r.qa.question}"): ${r.scoring.notes.CO}`);
      }
      lines.push("");
    }
  }

  // Remediation recommendations
  lines.push(`## Remediation Recommendations`);
  lines.push("");
  const p0 = results.filter((r) => r.scoring.flags.includes("CRITICAL_FAIL"));
  const p1 = results.filter((r) => !r.scoring.pass && !r.scoring.flags.includes("CRITICAL_FAIL"));
  const p2 = results.filter((r) => r.scoring.pass && r.scoring.flags.includes("PARTIAL_ANSWER"));

  if (p0.length) {
    lines.push(`### P0 — Production Blockers (${p0.length})`);
    for (const r of p0) {
      const rootCauses = [];
      if (r.scoring.scores.FA === 0) rootCauses.push("knowledge base gap in system prompt");
      if (r.scoring.flags.includes("ESCALATION_MISSED")) rootCauses.push("missing escalation guidance in prompt");
      if (r.scoring.flags.includes("HALLUCINATION_DETECTED")) rootCauses.push("model hallucination — add explicit constraint to prompt");
      lines.push(`- **${r.qa.id}** — ${r.qa.question}`);
      lines.push(`  - Root cause: ${rootCauses.join("; ") || "see scoring notes"}`);
      lines.push(`  - Fix: Update FAQ entries in \`app/prompts/prompts.json\``);
      lines.push(`  - Verify: Re-run ${r.qa.id} after prompt update, expect ≥70%`);
    }
    lines.push("");
  }

  if (p1.length) {
    lines.push(`### P1 — High Priority (${p1.length})`);
    for (const r of p1) {
      lines.push(`- **${r.qa.id}** — ${r.qa.question} (${r.scoring.pct}%)`);
    }
    lines.push("");
  }

  if (p2.length) {
    lines.push(`### P2 — Improvements (${p2.length})`);
    for (const r of p2) {
      lines.push(`- **${r.qa.id}** — ${r.qa.question}: ${r.scoring.notes.CO}`);
    }
    lines.push("");
  }

  // Regression registry
  lines.push(`## Regression Test Registry`);
  lines.push("");
  lines.push(`| ID | Category | Question | Baseline Score | Pass |`);
  lines.push(`|---|---|---|---|---|`);
  for (const r of results) {
    lines.push(`| ${r.qa.id} | ${r.qa.category} | ${r.qa.question} | ${r.scoring.pct}% | ${r.scoring.pass ? "Yes" : "No"} |`);
  }
  lines.push("");
  lines.push(`*Use this table to detect regressions after prompt changes. Re-run and compare scores.*`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n🧪 Rinfit AI Chatbot QA Test Runner`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Questions: ${QA_PAIRS.length}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < QA_PAIRS.length; i++) {
    const qa = QA_PAIRS[i];
    process.stdout.write(`[${i + 1}/${QA_PAIRS.length}] ${qa.id} — "${qa.question.slice(0, 60)}"... `);

    const response = await sendChatMessage(qa.question);
    const scoring = scoreResponse(qa, response.text);

    results.push({ qa, response, scoring });

    const icon = response.hasError ? "💥" : scoring.pass ? "✅" : "❌";
    console.log(`${icon} ${response.hasError ? `ERROR: ${response.errorMsg}` : `${scoring.pct}%`}`);

    if (i < QA_PAIRS.length - 1) {
      await new Promise((res) => setTimeout(res, DELAY_MS));
    }
  }

  const endTime = Date.now();

  const report = buildReport(results, startTime, endTime);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const outPath = `docs/chatbot-test-report-${timestamp}.md`;

  writeFileSync(outPath, report, "utf8");

  console.log(`\n📄 Report written to: ${outPath}`);

  // Summary
  const passed = results.filter((r) => r.scoring.pass).length;
  const overall = Math.round(
    ["A", "B", "C", "D"].reduce((s, c) => {
      const items = results.filter((r) => r.qa.category === c);
      const w = { A: 0.30, B: 0.35, C: 0.10, D: 0.25 }[c];
      return items.length
        ? s + (items.reduce((x, r) => x + r.scoring.pct, 0) / items.length) * w
        : s;
    }, 0)
  );
  console.log(`\n📊 Summary: ${passed}/${results.length} passed | Overall: ${overall}%`);
  if (overall >= 80) console.log("✅ PRODUCTION READY");
  else if (overall >= 70) console.log("⚠️  CONDITIONAL PASS — remediation required");
  else console.log("❌ REQUIRES REMEDIATION");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
