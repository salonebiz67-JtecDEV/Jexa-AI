import { DatabaseService } from '../backend/src/database/db-service';
import { MemoryService } from '../backend/src/services/memory.service';
import { AIMemoryExtractor } from '../backend/src/services/ai-memory-extractor.service';
import { SearchDecisionService } from '../backend/src/services/search-decision.service';
import { searchRelevantMemories } from '../ai/memory/memory-retrieval';
import { assembleConversationContext } from '../ai/brain/context-handler';
import { MemoryItem } from '../shared/types/memory';

async function runContextualReasoningSuite() {
  console.log('====================================================');
  console.log('JEXA CONTEXTUAL UNDERSTANDING & REASONING SUITE');
  console.log('====================================================\n');

  const report: Record<string, 'PASS' | 'FAIL'> = {};
  const testUserId = '00000000-0000-0000-0000-000000000003';

  // Cleanup test user memories
  try {
    const existing = await DatabaseService.getMemories(testUserId);
    for (const m of existing) {
      await DatabaseService.deleteMemory(m.id, testUserId);
    }
  } catch (e) {
    // ignore
  }

  // Seed baseline memories for testing
  const memorySister = await DatabaseService.createMemory(
    {
      category: 'relationships_dates',
      fact: "User's sister is Mariama.",
      confidence: 0.95,
      memoryType: 'confirmed_fact',
    },
    testUserId
  );

  const memoryProject = await DatabaseService.createMemory(
    {
      category: 'projects_goals',
      fact: 'User is building a solar energy billing platform for West Africa.',
      confidence: 0.95,
      memoryType: 'confirmed_fact',
    },
    testUserId
  );

  const memoryName = await DatabaseService.createMemory(
    {
      category: 'user_profile',
      fact: "User's preferred name is Johnny.",
      confidence: 0.98,
      memoryType: 'confirmed_fact',
    },
    testUserId
  );

  // --------------------------------------------------------------------------
  // TEST 1: Spelling Error & Typo Interpretation in Memory Retrieval
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing Spelling Error, Slang & Typo Interpretation...');
  const typoQuery1 = 'wat do u kno bout my sistr?';
  const memories1 = await MemoryService.getRelevantMemories(typoQuery1, 5, testUserId);
  const foundSister = memories1.some((m) => m.fact.includes('Mariama'));

  const typoQuery2 = 'tell me bout dat projek';
  const memories2 = await MemoryService.getRelevantMemories(typoQuery2, 5, testUserId);
  const foundProject = memories2.some((m) => m.fact.includes('solar energy billing'));

  const typoQuery3 = 'wats my nam';
  const memories3 = await MemoryService.getRelevantMemories(typoQuery3, 5, testUserId);
  const foundName = memories3.some((m) => m.fact.includes('Johnny'));

  console.log('  Typo retrieval results:', { foundSister, foundProject, foundName });

  if (foundSister && foundProject && foundName) {
    console.log('  -> Typos, phonetic contractions, and slang successfully resolved to correct memories.');
    report['Spelling error & slang interpretation'] = 'PASS';
  } else {
    console.error('  -> Failed typo retrieval:', { memories1, memories2, memories3 });
    report['Spelling error & slang interpretation'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 2: Contextual Follow-ups & Pronoun Resolution in Memory Retrieval
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Contextual Follow-up & Pronoun Resolution...');
  const followUpQuery = 'How is it going with that?';
  const recentDialogue = 'USER: I was reviewing our solar energy billing platform earlier.\nASSISTANT: We discussed the billing schedule.';

  const followUpMemories = await MemoryService.getRelevantMemories(
    followUpQuery,
    5,
    testUserId,
    recentDialogue
  );
  const resolvedContextualProject = followUpMemories.some((m) => m.fact.includes('solar energy billing'));

  console.log('  Follow-up resolution result:', { resolvedContextualProject });

  if (resolvedContextualProject) {
    console.log('  -> Pronoun "that" accurately resolved using recent conversation dialogue.');
    report['Contextual follow-up pronoun resolution'] = 'PASS';
  } else {
    console.error('  -> Failed follow-up resolution:', followUpMemories);
    report['Contextual follow-up pronoun resolution'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 3: Contextual Follow-up Search Query Formulation
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Contextual Search Query Formulation...');
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
  // TEST 4: Intelligent Tool Selection (Direct Answer vs Live Search)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Intelligent Tool Selection (Search vs Direct Answer)...');

  // Case A: Real-time news / sports / EDSA inquiry -> Should search
  const liveDecision = await SearchDecisionService.evaluate('latest EDSA power outage news in Freetown Sierra Leone');
  // Case B: General coding / algorithm question -> Should NOT search
  const codingDecision = await SearchDecisionService.evaluate('write a TypeScript function to reverse a linked list');
  // Case C: Memory statement -> Should NOT search
  const memoryDecision = await SearchDecisionService.evaluate('remember that my favorite IDE is Cursor');

  console.log('  Tool selection categories:', {
    liveSearch: liveDecision.shouldSearch,
    codingDirect: !codingDecision.shouldSearch,
    memoryDirect: !memoryDecision.shouldSearch,
  });

  if (liveDecision.shouldSearch && !codingDecision.shouldSearch && !memoryDecision.shouldSearch) {
    console.log('  -> Search triggered appropriately for live facts and suppressed for general logic/memory.');
    report['Intelligent tool selection'] = 'PASS';
  } else {
    report['Intelligent tool selection'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 5: Cross-Chat Past Conversation Recall
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Cross-Chat Conversation Search...');
  // Seed past conversation in another chat
  const pastConv = await DatabaseService.createConversation('Old Solar Planning Chat', 'empathetic_companion', testUserId);
  await DatabaseService.saveMessage(pastConv.id, {
    role: 'user',
    content: 'We decided to use Drizzle ORM and Postgres for the solar billing engine.',
  });
  await DatabaseService.saveMessage(pastConv.id, {
    role: 'assistant',
    content: 'Drizzle ORM with Postgres provides type safety and migrations for the billing system.',
  });

  const pastRecall = await DatabaseService.searchPastMessages(
    testUserId,
    'what have I told you about Drizzle ORM in my past chats?',
    'different-active-conv-id',
    4
  );

  const foundPastDiscussion = pastRecall.some((m) => m.content.includes('Drizzle ORM'));
  console.log('  Past chat recall results count:', pastRecall.length, 'found Drizzle:', foundPastDiscussion);

  if (foundPastDiscussion) {
    console.log('  -> Cross-conversation message search recalled past decisions without asking user to repeat.');
    report['Cross-chat past conversation recall'] = 'PASS';
  } else {
    console.error('  -> Failed cross-chat recall:', pastRecall);
    report['Cross-chat past conversation recall'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 6: Structured Reasoning & Truthful Prompt Context Assembly
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Structured Reasoning & Truthfulness Context...');
  const assembled = assembleConversationContext({
    personality: 'empathetic_companion',
    memories: [memorySister, memoryProject],
    pastConversationMessages: pastRecall,
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
  const hasAntiParrot = prompt.includes('Never repeat or rephrase the user');
  const hasReasoning = prompt.includes('Structured Problem-Solving');
  const hasHonesty = prompt.includes('Never pretend to recall past events');
  const hasContextDirectives = prompt.includes('Intent Over Surface Grammar');

  console.log('  System prompt invariant presence:', {
    hasAntiParrot,
    hasReasoning,
    hasHonesty,
    hasContextDirectives,
  });

  if (hasAntiParrot && hasReasoning && hasHonesty && hasContextDirectives) {
    console.log('  -> Prompt architecture enforces structured multi-step reasoning and truthful boundaries.');
    report['Reliable reasoning & truthful context assembly'] = 'PASS';
  } else {
    report['Reliable reasoning & truthful context assembly'] = 'FAIL';
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
