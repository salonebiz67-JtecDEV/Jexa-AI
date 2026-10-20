import { SearchDecisionService } from '../backend/src/services/search-decision.service';
import { TavilyService } from '../backend/src/services/tavily.service';
import { ToolRegistry } from '../backend/src/tools/tool-registry';
import { ToolExecutor } from '../backend/src/tools/tool-executor';
import { webSearchTool } from '../backend/src/tools/definitions/web-search.tool';
import { ChatService } from '../backend/src/services/chat.service';

async function runWebResearchTestSuite() {
  console.log('====================================================');
  console.log('JEXA WEB RESEARCH & SHARED ENGINE VERIFICATION SUITE');
  console.log('====================================================\n');

  const report: Record<string, 'PASS' | 'FAIL'> = {};

  // --------------------------------------------------------------------------
  // TEST 1: Automatic vs Manual Search Decision
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing Automatic vs Manual Search Decisions...');
  // Manual toggle from composer
  const manualDecision = await SearchDecisionService.evaluate('[web search requested] tell me about quantum computing');
  // Automatic current news
  const newsDecision = await SearchDecisionService.evaluate('latest breaking news on international climate summit today');
  // Ordinary greeting (must NOT search)
  const greetingDecision = await SearchDecisionService.evaluate('Hello Jexa! How are you doing today?');
  // Creative writing (must NOT search)
  const creativeDecision = await SearchDecisionService.evaluate('Write a bedtime story about a curious robotic fox in Freetown');
  // Pure algorithm coding (must NOT search)
  const codingDecision = await SearchDecisionService.evaluate('implement a bubble sort algorithm in typescript');

  console.log('  Decision matrix:', {
    manualToggle: manualDecision.shouldSearch,
    currentNews: newsDecision.shouldSearch,
    greetingAvoided: !greetingDecision.shouldSearch,
    creativeAvoided: !creativeDecision.shouldSearch,
    codingAvoided: !codingDecision.shouldSearch,
  });

  if (
    manualDecision.shouldSearch &&
    newsDecision.shouldSearch &&
    !greetingDecision.shouldSearch &&
    !creativeDecision.shouldSearch &&
    !codingDecision.shouldSearch
  ) {
    console.log('  -> Search triggers accurately for live news and manual requests, while avoiding chit-chat & coding.');
    report['Automatic vs manual search decisions'] = 'PASS';
  } else {
    report['Automatic vs manual search decisions'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 2: Query Understanding, Slang & Contextual Pronoun Expansion
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Query Understanding, Slang & Contextual Expansion...');
  const slangQuery1 = 'wat is d latest news about spaceX';
  const cleaned1 = SearchDecisionService.cleanQuery(slangQuery1);

  const slangQuery2 = 'can u luk up premier league scores';
  const cleaned2 = SearchDecisionService.cleanQuery(slangQuery2);

  const contextualFollowUp = await SearchDecisionService.evaluate(
    'can you search for that online?',
    undefined,
    undefined,
    'USER: Did EDSA make an announcement about Freetown power outage today?\nASSISTANT: I can check the latest announcements.'
  );

  console.log('  Query cleaning results:', {
    cleaned1,
    cleaned2,
    contextualQuery: contextualFollowUp.query,
  });

  const validCleaning =
    !cleaned1.toLowerCase().includes('wat is d') &&
    cleaned1.toLowerCase().includes('spacex') &&
    !cleaned2.toLowerCase().includes('can u luk up') &&
    contextualFollowUp.shouldSearch &&
    contextualFollowUp.query.toLowerCase().includes('edsa');

  if (validCleaning) {
    console.log('  -> Slang, phonetic typos, and pronouns successfully expanded into effective search queries.');
    report['Query understanding and contextual formulation'] = 'PASS';
  } else {
    report['Query understanding and contextual formulation'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 3: Shared Engine Integration (ToolRegistry & ToolExecutor)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Shared Tool Engine Registration & Execution...');
  const registry = ToolRegistry.getInstance();
  const registeredTool = registry.getTool('web_search');

  const hasTool = Boolean(registeredTool && registeredTool.name === 'web_search');
  const hasSchema = Boolean(registeredTool?.inputSchema?.properties?.query);
  const isReadOnly = registeredTool?.permissionLevel === 'read_only';

  // Test argument validation on executor
  const invalidExec = await ToolExecutor.executeTool(
    webSearchTool,
    { query: '' } as any,
    {}
  );
  const validationBlocked =
    !invalidExec.success &&
    (invalidExec.error?.includes('required argument') || invalidExec.error?.includes('empty'));

  console.log('  Shared engine checks:', {
    hasTool,
    hasSchema,
    isReadOnly,
    validationBlocked,
  });

  if (hasTool && hasSchema && isReadOnly && validationBlocked) {
    console.log('  -> web_search tool properly registered in shared engine with schema validation.');
    report['Shared engine registration & validation'] = 'PASS';
  } else {
    report['Shared engine registration & validation'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 4: SSRF Prevention & Safe URL Validation
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing URL Security & SSRF Protection...');
  const localCheck = TavilyService.validateExternalUrl('http://localhost:3000/api/secret');
  const loopbackCheck = TavilyService.validateExternalUrl('http://127.0.0.1:8080/admin');
  const metadataCheck = TavilyService.validateExternalUrl('http://169.254.169.254/latest/meta-data');
  const privateClassACheck = TavilyService.validateExternalUrl('http://10.0.0.1/db');
  const validWebCheck = TavilyService.validateExternalUrl('https://reuters.com/world/africa');

  console.log('  SSRF validation results:', {
    localhostBlocked: !localCheck.valid,
    loopbackBlocked: !loopbackCheck.valid,
    metadataBlocked: !metadataCheck.valid,
    privateClassABlocked: !privateClassACheck.valid,
    validWebPermitted: validWebCheck.valid,
  });

  if (
    !localCheck.valid &&
    !loopbackCheck.valid &&
    !metadataCheck.valid &&
    !privateClassACheck.valid &&
    validWebCheck.valid
  ) {
    console.log('  -> SSRF vectors strictly blocked while valid external HTTPS URLs are accepted.');
    report['SSRF prevention and URL security'] = 'PASS';
  } else {
    report['SSRF prevention and URL security'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 5: Authoritative Source Recognition & Inaccessible Page Handling
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Authoritative Source Recognition & Inaccessible Handling...');
  const isReutersAuth = TavilyService.isAuthoritativeDomain('reuters.com');
  const isBbcAuth = TavilyService.isAuthoritativeDomain('bbc.co.uk');
  const isGovAuth = TavilyService.isAuthoritativeDomain('statehouse.gov.sl');
  const isEdsaAuth = TavilyService.isAuthoritativeDomain('edsa.sl');
  const isRandomAuth = TavilyService.isAuthoritativeDomain('spamblog12345.xyz');

  console.log('  Authoritative domain checks:', {
    isReutersAuth,
    isBbcAuth,
    isGovAuth,
    isEdsaAuth,
    isRandomAuthNot: !isRandomAuth,
  });

  // Test extraction of a non-existent domain to verify honest inaccessible reporting
  const inaccessibleExtract = await TavilyService.extractPages([
    'https://non-existent-domain-for-jexa-testing-404.sl/outage'
  ]);

  const inaccessibleReported =
    Array.isArray(inaccessibleExtract) &&
    inaccessibleExtract.length > 0 &&
    inaccessibleExtract[0].accessible === false;

  console.log('  Inaccessible page handling:', {
    inaccessibleReported,
    errorNotice: inaccessibleExtract[0]?.error,
  });

  if (
    isReutersAuth &&
    isBbcAuth &&
    isGovAuth &&
    isEdsaAuth &&
    !isRandomAuth &&
    inaccessibleReported
  ) {
    console.log('  -> Authoritative sources correctly identified; inaccessible pages reported without hallucinated text.');
    report['Authoritative sources and inaccessible page reporting'] = 'PASS';
  } else {
    report['Authoritative sources and inaccessible page reporting'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 6: Provider Error & Missing Key Handling
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Honest Error Reporting & Missing Key Handling...');
  const originalKey = process.env.TAVILY_API_KEY;
  try {
    delete process.env.TAVILY_API_KEY;

    // Execute tool with unconfigured API key
    const missingKeyResult = await ToolExecutor.executeTool(
      webSearchTool,
      { query: 'Sierra Leone news' },
      {}
    );

    const reportsMissingKey =
      !missingKeyResult.success &&
      (missingKeyResult.error?.includes('TAVILY_API_KEY') || missingKeyResult.error?.includes('not available'));

    console.log('  Missing key execution check:', {
      success: missingKeyResult.success,
      error: missingKeyResult.error,
      reportsMissingKey,
    });

    if (reportsMissingKey) {
      console.log('  -> Missing API key reported honestly without false claims of successful research.');
      report['Provider error and missing key handling'] = 'PASS';
    } else {
      report['Provider error and missing key handling'] = 'FAIL';
    }
  } finally {
    if (originalKey) {
      process.env.TAVILY_API_KEY = originalKey;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 7: Multi-Source Execution & Source Card Formatting
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Multi-Source Execution and Source Card Data Structure...');
  // Mock TavilyService.isConfigured & search to test multi-source processing deterministically
  const originalSearch = TavilyService.search;
  const originalConfigured = TavilyService.isConfigured;
  (TavilyService as any).isConfigured = () => true;
  (TavilyService as any).search = async (query: string) => {
    return {
      success: true,
      query,
      results: [
        {
          title: 'EDSA Restores Power to Western Area After Grid Maintenance',
          url: 'https://statehouse.gov.sl/edsa-restores-power',
          content: 'The Electricity Distribution and Supply Authority announced the completion of maintenance at Bumbuna.',
          domain: 'statehouse.gov.sl',
          authoritative: true,
          isAccessible: true,
          publishedDate: '2026-10-18',
        },
        {
          title: 'Awoko News: Freetown Electricity Improvements Detailed by Ministry',
          url: 'https://awokonewspaper.sl/freetown-electricity-improvements',
          content: 'Ministry of Energy confirmed 40MW supply stabilization in Freetown.',
          domain: 'awokonewspaper.sl',
          authoritative: true,
          isAccessible: true,
          publishedDate: '2026-10-19',
        },
      ],
    };
  };

  const multiSourceResult = await ToolExecutor.executeTool(
    webSearchTool,
    { query: 'EDSA electricity outage Freetown', inspectPages: false },
    {}
  );

  // Restore original
  (TavilyService as any).search = originalSearch;
  (TavilyService as any).isConfigured = originalConfigured;

  const hasSources = multiSourceResult.success && (multiSourceResult.data?.resultsCount || 0) >= 2;
  const hasDisclosures = (multiSourceResult.sourceDisclosures?.length || 0) >= 2;
  const hasAuthoritative = (multiSourceResult.data?.authoritativeSourcesCount || 0) >= 1;

  console.log('  Multi-source verification:', {
    hasSources,
    hasDisclosures,
    hasAuthoritative,
    sourcesCount: multiSourceResult.data?.resultsCount,
  });

  if (hasSources && hasDisclosures && hasAuthoritative) {
    console.log('  -> Multi-source research aggregated and enriched with source cards and authority verification.');
    report['Multi-source research & source cards'] = 'PASS';
  } else {
    report['Multi-source research & source cards'] = 'FAIL';
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
