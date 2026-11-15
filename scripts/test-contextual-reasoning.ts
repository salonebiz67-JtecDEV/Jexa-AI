import { SearchDecisionService } from '../backend/src/services/search-decision.service';
import { assembleConversationContext } from '../ai/brain/context-handler';

async function runContextualReasoningSuite() {
  console.log('====================================================');
  console.log('JEXA CONTEXTUAL UNDERSTANDING & REASONING SUITE');
  console.log('====================================================\n');

  const report: Record<string, 'PASS' | 'FAIL'> = {};

  // --------------------------------------------------------------------------
  // TEST 1: Contextual Follow-up Search Query Formulation
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing Contextual Search Query Formulation...');
  const searchFollowUpDecision = await SearchDecisionService.evaluate(
    'can you search for that online?',
    undefined,
    undefined,
    'USER: Did EDSA make an announcement about Freetown power outage today?\nASSISTANT: I can check the latest announcements.'
  );

  console.log('  Follow-up search decision:', {
    shouldSearch: searchFollowUpDecision.shouldSearch,
    query: searchFollowUpDecision.query,
    category: searchFollowUpDecision.category,
  });

  const validFormulatedQuery =
    searchFollowUpDecision.shouldSearch &&
    searchFollowUpDecision.query.toLowerCase().includes('edsa') &&
    !searchFollowUpDecision.query.toLowerCase().startsWith('that');

  if (validFormulatedQuery) {
    console.log('  -> Generic pronoun "search for that" successfully expanded into contextual search query.');
    report['Contextual search query formulation'] = 'PASS';
  } else {
    console.error('  -> Failed search query formulation:', searchFollowUpDecision);
    report['Contextual search query formulation'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 2: Intelligent Tool Selection (Direct Answer vs Live Search)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Intelligent Tool Selection (Search vs Direct Answer)...');

  const liveDecision = await SearchDecisionService.evaluate('latest EDSA power outage news in Freetown Sierra Leone');
  const codingDecision = await SearchDecisionService.evaluate('write a TypeScript function to reverse a linked list');
  const greetingDecision = await SearchDecisionService.evaluate('hello, how are you doing today?');

  console.log('  Tool selection categories:', {
    liveSearch: liveDecision.shouldSearch,
    codingDirect: !codingDecision.shouldSearch,
    greetingDirect: !greetingDecision.shouldSearch,
  });

  if (liveDecision.shouldSearch && !codingDecision.shouldSearch && !greetingDecision.shouldSearch) {
    console.log('  -> Search triggered appropriately for live facts and suppressed for general logic/greetings.');
    report['Intelligent tool selection'] = 'PASS';
  } else {
    report['Intelligent tool selection'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 3: Stateless Personalization Prompt Assembly (About me & Behavior)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Stateless Prompt Assembly with About Me & Behavior...');
  const assembled = assembleConversationContext({
    personality: 'empathetic_companion',
    aboutMe: 'My preferred name is Johnny. My sister is Mariama. I am building a solar billing platform.',
    behaviorInstructions: 'Be concise and use practical TypeScript examples.',
    recentMessages: [
      {
        id: '1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'How should we architect the solar billing engine?',
        createdAt: new Date().toISOString(),
      },
    ],
  });

  const prompt = assembled.systemPrompt;
  const hasAboutMe = prompt.includes('Johnny') && prompt.includes('Mariama');
  const hasBehavior = prompt.includes('practical TypeScript examples');
  const hasHonesty =
    prompt.includes('pretend to recall earlier chats') &&
    prompt.includes('NEVER make up facts');

  console.log('  System prompt check:', {
    hasAboutMe,
    hasBehavior,
    hasHonesty,
  });

  if (hasAboutMe && hasBehavior && hasHonesty) {
    console.log('  -> Prompt architecture injects on-device About me, behavior rules, and truthfulness constraints.');
    report['Stateless personalization & truthfulness'] = 'PASS';
  } else {
    report['Stateless personalization & truthfulness'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // FINAL SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log('TEST SUITE REPORT:');
  console.log('====================================================');
  let allPass = true;
  for (const [name, status] of Object.entries(report)) {
    console.log(`${name.padEnd(45)}: ${status}`);
    if (status !== 'PASS') allPass = false;
  }
  console.log('====================================================');
  console.log('RESULT:', allPass ? 'ALL TESTS PASSED SUCCESSFULLY' : 'SOME TESTS FAILED');
  console.log('====================================================');

  if (!allPass) {
    process.exit(1);
  }
}

runContextualReasoningSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
