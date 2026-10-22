import { SearchDecisionService } from '../backend/src/services/search-decision.service';
import { TavilyService } from '../backend/src/services/tavily.service';
import { ToolRegistry } from '../backend/src/tools/tool-registry';
import { ToolExecutor } from '../backend/src/tools/tool-executor';
import { webSearchTool } from '../backend/src/tools/definitions/web-search.tool';
import { cleanAndNormalizeResponseContent } from '../ai/brain/response-cleaner';

async function runWebResearchTestSuite() {
  console.log('====================================================');
  console.log('JEXA WEB RESEARCH & INTELLIGENT SEARCH TEST SUITE');
  console.log('====================================================\n');

  const report: Record<string, 'PASS' | 'FAIL'> = {};

  // --------------------------------------------------------------------------
  // TEST 1: Automatic Search Decisions (No explicit "search" keyword required)
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing Automatic Search Decisions Without Explicit Keywords...');
  // Officeholders & leadership
  const pmDecision = await SearchDecisionService.evaluate('who is the current prime minister of the UK');
  const ceoDecision = await SearchDecisionService.evaluate('who is the current CEO of Microsoft');
  // Temporal facts (2025/2026 events)
  const temporalDecision = await SearchDecisionService.evaluate('what is the status of the Artemis II mission in 2025');
  // Real-time rates & weather
  const cryptoDecision = await SearchDecisionService.evaluate('what is the current price of Bitcoin today');
  // Local utility
  const edsaDecision = await SearchDecisionService.evaluate('why is power off in Freetown Sierra Leone right now');

  console.log('  Automatic triggers:', {
    pmSearch: pmDecision.shouldSearch,
    ceoSearch: ceoDecision.shouldSearch,
    temporalSearch: temporalDecision.shouldSearch,
    cryptoSearch: cryptoDecision.shouldSearch,
    edsaSearch: edsaDecision.shouldSearch,
  });

  if (
    pmDecision.shouldSearch &&
    ceoDecision.shouldSearch &&
    temporalDecision.shouldSearch &&
    cryptoDecision.shouldSearch &&
    edsaDecision.shouldSearch
  ) {
    console.log('  -> Recognized queries needing external information without requiring "search" keywords.');
    report['1. Automatic search decisions'] = 'PASS';
  } else {
    report['1. Automatic search decisions'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 2: Explicit Research & Website URL Requests
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Explicit Research and Website URL Inspection...');
  const siteDecision = await SearchDecisionService.evaluate('research website https://news.bbc.co.uk/tech');
  const exploreDecision = await SearchDecisionService.evaluate('inspect https://example.com/press');
  const manualToggle = await SearchDecisionService.evaluate('[web search requested] explain string theory');

  console.log('  Explicit research decisions:', {
    siteSearch: siteDecision.shouldSearch,
    siteUrls: siteDecision.urlsToInspect,
    exploreSearch: exploreDecision.shouldSearch,
    exploreUrls: exploreDecision.urlsToInspect,
    manualToggle: manualToggle.shouldSearch,
  });

  const validExplicit =
    siteDecision.shouldSearch &&
    Array.isArray(siteDecision.urlsToInspect) &&
    siteDecision.urlsToInspect.includes('https://news.bbc.co.uk/tech') &&
    exploreDecision.shouldSearch &&
    Array.isArray(exploreDecision.urlsToInspect) &&
    exploreDecision.urlsToInspect.includes('https://example.com/press') &&
    manualToggle.shouldSearch &&
    manualToggle.isManual === true;

  if (validExplicit) {
    console.log('  -> Explicit website URLs correctly captured in urlsToInspect and manual toggle preserved.');
    report['2. Explicit research & website URLs'] = 'PASS';
  } else {
    report['2. Explicit research & website URLs'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 3: Ordinary Conversation (Strictly Avoid Unnecessary Search)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Avoidance of Search for Ordinary Conversation...');
  const greeting = await SearchDecisionService.evaluate('Hello Jexa! Good morning, how are you?');
  const identity = await SearchDecisionService.evaluate('Who are you and what are your capabilities?');
  const math = await SearchDecisionService.evaluate('calculate 45 * 18');
  const creative = await SearchDecisionService.evaluate('Write a short bedtime story about a friendly dragon');
  const algorithm = await SearchDecisionService.evaluate('implement a binary search algorithm in python');

  console.log('  Conversation check:', {
    greetingBlocked: !greeting.shouldSearch,
    identityBlocked: !identity.shouldSearch,
    mathBlocked: !math.shouldSearch,
    creativeBlocked: !creative.shouldSearch,
    algorithmBlocked: !algorithm.shouldSearch,
  });

  if (
    !greeting.shouldSearch &&
    !identity.shouldSearch &&
    !math.shouldSearch &&
    !creative.shouldSearch &&
    !algorithm.shouldSearch
  ) {
    console.log('  -> Search avoided for greetings, identity, math, creative writing, and coding algorithms.');
    report['3. Ordinary conversation avoidance'] = 'PASS';
  } else {
    report['3. Ordinary conversation avoidance'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 4: Query Simplification and Retry Logic
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Query Simplification for Zero-Result Retries...');
  const complexQuery = 'what is the current status of EDSA electricity power cut in Freetown Sierra Leone';
  const simplified = SearchDecisionService.simplifyQuery(complexQuery);

  console.log('  Simplification check:', {
    original: complexQuery,
    simplified,
  });

  if (
    simplified.length > 0 &&
    !simplified.includes('what is the') &&
    simplified.includes('EDSA') &&
    simplified.includes('Freetown')
  ) {
    console.log('  -> Query simplification cleanly strips stopwords and punctuation for broadening search.');
    report['4. Query simplification & retry logic'] = 'PASS';
  } else {
    report['4. Query simplification & retry logic'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 5: Direct URL Extraction in Web Search Tool
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Web Search Tool with Direct URL Extraction...');
  const origExtract = TavilyService.extractPages;
  const origConfigured = TavilyService.isConfigured;
  const origSearch = TavilyService.search;

  (TavilyService as any).isConfigured = () => true;
  (TavilyService as any).search = async () => ({
    success: true,
    query: 'https://example.org/release-notes',
    results: [],
  });
  (TavilyService as any).extractPages = async (urls: string[]) => [
    {
      url: urls[0],
      title: 'Official Release Notes v2.4',
      domain: 'example.org',
      content: 'Version 2.4 adds new real-time synchronization pipelines and security audits.',
      accessible: true,
      authoritative: true,
    },
  ];

  const toolExec = await ToolExecutor.executeTool(
    webSearchTool,
    {
      query: 'https://example.org/release-notes',
      urlsToInspect: ['https://example.org/release-notes'],
    },
    {}
  );

  (TavilyService as any).extractPages = origExtract;
  (TavilyService as any).isConfigured = origConfigured;
  (TavilyService as any).search = origSearch;

  const urlMergedAsSource =
    toolExec.success &&
    toolExec.data?.results &&
    toolExec.data.results.length === 1 &&
    toolExec.data.results[0].title === 'Official Release Notes v2.4';

  console.log('  URL inspection results:', {
    success: toolExec.success,
    resultsCount: toolExec.data?.resultsCount,
    sourceTitle: toolExec.data?.results?.[0]?.title,
  });

  if (urlMergedAsSource) {
    console.log('  -> Direct URL inspected pages successfully promoted to verified research sources.');
    report['5. Direct URL inspection integration'] = 'PASS';
  } else {
    report['5. Direct URL inspection integration'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 6: Source Accuracy, Authoritative Domains & Inaccessible Handling
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Source Accuracy, Authority Verification & SSRF...');
  const isReutersAuth = TavilyService.isAuthoritativeDomain('reuters.com');
  const isGovAuth = TavilyService.isAuthoritativeDomain('statehouse.gov.sl');
  const isRandomAuth = TavilyService.isAuthoritativeDomain('fake-news-network.biz');

  const ssrfLocal = TavilyService.validateExternalUrl('http://127.0.0.1:8080');
  const ssrfAws = TavilyService.validateExternalUrl('http://169.254.169.254/latest');
  const validUrl = TavilyService.validateExternalUrl('https://bbc.com/news');

  console.log('  Security & Authority:', {
    isReutersAuth,
    isGovAuth,
    isRandomAuthBlocked: !isRandomAuth,
    ssrfLocalBlocked: !ssrfLocal.valid,
    ssrfAwsBlocked: !ssrfAws.valid,
    validUrlAllowed: validUrl.valid,
  });

  if (isReutersAuth && isGovAuth && !isRandomAuth && !ssrfLocal.valid && !ssrfAws.valid && validUrl.valid) {
    console.log('  -> Authority verification active and SSRF vectors strictly blocked.');
    report['6. Source accuracy & SSRF prevention'] = 'PASS';
  } else {
    report['6. Source accuracy & SSRF prevention'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 7: Clean Markdown Rendering (Paragraphs default, <br> tags stripped)
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Markdown Rendering & HTML Artifact Cleaning...');
  const dirtyAiResponse = 'Here is the latest update:<br><br>The meeting concluded with a mutual agreement.<br>Details follow below.';
  const cleaned = cleanAndNormalizeResponseContent(dirtyAiResponse, { isFirstTurn: false });

  console.log('  Response cleaning:', {
    original: dirtyAiResponse,
    cleaned,
  });

  if (!cleaned.includes('<br>') && cleaned.includes('The meeting concluded')) {
    console.log('  -> Literal HTML <br> tags cleanly replaced with proper Markdown linebreaks.');
    report['7. Markdown formatting & paragraph default'] = 'PASS';
  } else {
    report['7. Markdown formatting & paragraph default'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // FINAL SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log('TEST SUITE REPORT:');
  console.log('====================================================');
  let allPass = true;
  for (const [name, status] of Object.entries(report)) {
    console.log(`${name.padEnd(48)}: ${status}`);
    if (status !== 'PASS') allPass = false;
  }
  console.log('====================================================');
  console.log('RESULT:', allPass ? 'ALL TESTS PASSED SUCCESSFULLY' : 'SOME TESTS FAILED');
  console.log('====================================================');

  process.exit(allPass ? 0 : 1);
}

runWebResearchTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
