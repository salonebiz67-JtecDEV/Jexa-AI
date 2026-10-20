import { DatabaseService, DEFAULT_USER_ID } from '../backend/src/database/db-service';
import { MemoryService } from '../backend/src/services/memory.service';
import { AIMemoryExtractor } from '../backend/src/services/ai-memory-extractor.service';
import { getCategoryLabel, normalizeCategory, MemoryItem } from '../shared/types/memory';

async function runMemoryTestSuite() {
  console.log('====================================================');
  console.log('JEXA AUTOMATIC MEMORY & PERSISTENCE VERIFICATION SUITE');
  console.log('====================================================\n');

  const report: Record<string, 'PASS' | 'FAIL'> = {};
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const otherUserId = '00000000-0000-0000-0000-000000000002';

  // Cleanup any test memories for isolated tests
  try {
    const existing = await DatabaseService.getMemories(testUserId);
    for (const m of existing) {
      await DatabaseService.deleteMemory(m.id, testUserId);
    }
    const otherExisting = await DatabaseService.getMemories(otherUserId);
    for (const m of otherExisting) {
      await DatabaseService.deleteMemory(m.id, otherUserId);
    }
  } catch (e) {
    // Ignore cleanup errors
  }

  // --------------------------------------------------------------------------
  // TEST 1: Sensitive Data & Secret Protection (Never store passwords, keys, private medical/finance)
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing Sensitive Data & Secrets Protection...');
  const secret1 = await AIMemoryExtractor.analyze('My password is SuperSecret123!', []);
  const secret2 = await AIMemoryExtractor.analyze('My API key is sk-proj-1234567890abcdef1234567890', []);
  const secret3 = await AIMemoryExtractor.analyze('My credit card number is 4111 2222 3333 4444', []);
  const secret4 = await AIMemoryExtractor.analyze('Please keep this private, do not save to memory', []);

  if (
    secret1.action === 'privacy_skipped' &&
    secret2.action === 'privacy_skipped' &&
    secret3.action === 'privacy_skipped' &&
    secret4.action === 'privacy_skipped'
  ) {
    console.log('  -> Sensitive inputs properly blocked from memory storage.');
    report['Sensitive data protection'] = 'PASS';
  } else {
    console.error('  -> Failed: Sensitive data was not skipped.', { secret1, secret2, secret3, secret4 });
    report['Sensitive data protection'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 2: Automatic Memory Extraction - 5 Connected Categories (No "remember this")
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Automatic Extraction across 5 Connected Categories...');

  // Category 1: User Profile
  const ex1 = await AIMemoryExtractor.analyze('My name is Alex and I live in Freetown, Sierra Leone.', []);
  const cat1 = ex1.candidates[0]?.category;

  // Category 2: Relationships & Important Dates
  const ex2 = await AIMemoryExtractor.analyze('My sister is Mariama and her birthday is March 14th.', []);
  const cat2 = ex2.candidates[0]?.category;

  // Category 3: Preferences & Settings
  const ex3 = await AIMemoryExtractor.analyze('My primary stack is React, Node.js, and TypeScript with Tailwind.', []);
  const cat3 = ex3.candidates[0]?.category;

  // Category 4: Projects & Goals
  const ex4 = await AIMemoryExtractor.analyze('My goal is to launch our solar energy billing platform by November.', []);
  const cat4 = ex4.candidates[0]?.category;

  // Category 5: Conversation Insights
  const ex5 = await AIMemoryExtractor.analyze('I tend to struggle with estimating backend sprint tasks accurately.', []);
  const cat5 = ex5.candidates[0]?.category;

  console.log('  Category assignments:', {
    userProfile: cat1,
    relationships: cat2,
    preferences: cat3,
    projectsGoals: cat4,
    conversationInsights: cat5,
  });

  if (
    cat1 === 'user_profile' &&
    cat2 === 'relationships_dates' &&
    cat3 === 'preferences_settings' &&
    cat4 === 'projects_goals' &&
    cat5 === 'conversation_insights'
  ) {
    console.log('  -> All 5 connected categories correctly extracted without "remember this"');
    report['5 connected categories extraction'] = 'PASS';
  } else {
    report['5 connected categories extraction'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 3: Casual Messages & Questions Ignored (No noise saved)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Casual Chatter Filter...');
  const casual1 = await AIMemoryExtractor.analyze('Hello how are you today?', []);
  const casual2 = await AIMemoryExtractor.analyze('What time is it in London?', []);
  const casual3 = await AIMemoryExtractor.analyze('haha lol cool thanks', []);

  if (casual1.action === 'none' && casual2.action === 'none' && casual3.action === 'none') {
    console.log('  -> Casual greetings, small talk, and questions correctly ignored.');
    report['Casual chatter filtering'] = 'PASS';
  } else {
    console.error('  -> Failed: Casual messages triggered memory save.', { casual1, casual2, casual3 });
    report['Casual chatter filtering'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 4: Real Persistence & Storage Confirmation
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Real Database Persistence...');
  let savedStatusTriggered = false;
  let statusMessageReceived = '';

  const saveRes = await MemoryService.extractAndStoreFromMessage(
    'My preferred name is Alex and I work as Senior Architect at Apex Systems.',
    'conv-test-1',
    testUserId,
    (status) => {
      statusMessageReceived = status;
      if (status.startsWith('Memory saved')) {
        savedStatusTriggered = true;
      }
    }
  );

  console.log('  Save result action:', saveRes.action);
  console.log('  Status emitted:', statusMessageReceived);

  const persistedList = await DatabaseService.getMemories(testUserId);
  const foundMemory = persistedList.find((m) => m.fact.includes('Alex') || m.fact.includes('Senior Architect'));

  if (saveRes.action === 'saved' && foundMemory && savedStatusTriggered) {
    console.log('  -> Memory successfully persisted in database with accurate status indicator.');
    report['Real database persistence'] = 'PASS';
  } else {
    console.error('  -> Failed persistence check:', { saveRes, persistedList });
    report['Real database persistence'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 5: Duplicate Prevention
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Duplicate Prevention...');
  const dupDecision = await AIMemoryExtractor.analyze(
    'My preferred name is Alex.',
    persistedList
  );

  if (dupDecision.action === 'already_remembered') {
    console.log('  -> Duplicate fact detected and prevented from creating redundant memory.');
    report['Duplicate prevention'] = 'PASS';
  } else {
    console.error('  -> Duplicate check failed:', dupDecision);
    report['Duplicate prevention'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 6: Memory Update & Stale Superseding
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Memory Update & Stale Fact Superseding...');
  const updateRes = await MemoryService.extractAndStoreFromMessage(
    'Update what you remember: my preferred name is Alexander.',
    'conv-test-2',
    testUserId
  );

  const updatedList = await DatabaseService.getMemories(testUserId);
  const alexanderMem = updatedList.find((m) => m.fact.includes('Alexander'));
  const alexCount = updatedList.filter((m) => m.fact.includes('Alex')).length;

  if (updateRes.action === 'updated' && alexanderMem && alexCount === 1) {
    console.log('  -> Memory successfully updated in-place without duplicate pollution.');
    report['Memory update and superseding'] = 'PASS';
  } else {
    console.error('  -> Update check failed:', { updateRes, updatedList });
    report['Memory update and superseding'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 7: Cross-Chat Retrieval (Recall across conversations)
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Cross-Chat Semantic Retrieval...');
  // Add a project goal memory
  await DatabaseService.createMemory(
    {
      category: 'projects_goals',
      fact: 'User is leading the Sierra Leone clean energy grid deployment.',
      confidence: 0.95,
      memoryType: 'confirmed_fact',
      sourceConversationId: 'earlier-chat-uuid',
    },
    testUserId
  );

  const relevant = await MemoryService.getRelevantMemories('tell me about my energy project', 5, testUserId);
  const recalledProject = relevant.some((m) => m.fact.includes('Sierra Leone clean energy'));

  if (recalledProject) {
    console.log('  -> Relevant memory recalled across chats by semantic meaning.');
    report['Cross-chat memory retrieval'] = 'PASS';
  } else {
    console.error('  -> Failed cross-chat retrieval:', relevant);
    report['Cross-chat memory retrieval'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 8: Explicit Forgetting Directive
  // --------------------------------------------------------------------------
  console.log('\n[Test 8] Testing Explicit Memory Deletion ("forget this")...');
  const forgetRes = await MemoryService.extractAndStoreFromMessage(
    'Please forget my energy grid deployment project.',
    'conv-test-3',
    testUserId
  );

  const afterForgetList = await DatabaseService.getMemories(testUserId);
  const projectStillExists = afterForgetList.some((m) => m.fact.includes('energy grid'));

  if (forgetRes.action === 'deleted' && !projectStillExists) {
    console.log('  -> Explicit forget request honored and memory deleted from database.');
    report['Explicit forgetting'] = 'PASS';
  } else {
    console.error('  -> Forget check failed:', { forgetRes, afterForgetList });
    report['Explicit forgetting'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 9: User Isolation (Per-user database boundary)
  // --------------------------------------------------------------------------
  console.log('\n[Test 9] Testing User Privacy & Isolation...');
  // Create private memory for otherUserId
  const otherMem = await DatabaseService.createMemory(
    {
      category: 'user_profile',
      fact: 'User is high-net-worth investor located in Zurich.',
      confidence: 0.95,
      memoryType: 'confirmed_fact',
    },
    otherUserId
  );

  // Attempt to retrieve using testUserId
  const user1Memories = await DatabaseService.getMemories(testUserId);
  const leaked = user1Memories.some((m) => m.fact.includes('Zurich') || m.id === otherMem.id);

  if (!leaked) {
    console.log('  -> Complete isolation verified: User 1 cannot access User 2 memories.');
    report['User data isolation'] = 'PASS';
  } else {
    console.error('  -> ISOLATION BREACH: User 1 saw User 2 memory!');
    report['User data isolation'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 10: Honest Error Status on Persistence Failure
  // --------------------------------------------------------------------------
  console.log('\n[Test 10] Testing Honest Status Reporting on Storage Failure...');
  let failureStatusReceived = '';
  // Force simulate database failure by passing invalid handler
  const originalCreate = DatabaseService.createMemory;
  (DatabaseService as any).createMemory = async () => {
    throw new Error('Simulated network timeout connecting to persistence cluster');
  };

  const failRes = await MemoryService.extractAndStoreFromMessage(
    'Remember that I live in Bo Town.',
    'conv-test-4',
    testUserId,
    (status) => {
      failureStatusReceived = status;
    }
  );

  // Restore
  (DatabaseService as any).createMemory = originalCreate;

  if (failRes.action === 'failed' && failureStatusReceived === 'Memory storage unavailable') {
    console.log('  -> Honest failure reported: App did not falsely claim success when DB failed.');
    report['Honest persistence failure status'] = 'PASS';
  } else {
    console.error('  -> Failed error handling check:', { failRes, failureStatusReceived });
    report['Honest persistence failure status'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // FINAL SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log('TEST SUITE REPORT:');
  console.log('====================================================');
  let allPass = true;
  for (const [name, status] of Object.entries(report)) {
    console.log(`${name.padEnd(40)}: ${status}`);
    if (status !== 'PASS') allPass = false;
  }
  console.log('====================================================');
  console.log('RESULT:', allPass ? 'ALL TESTS PASSED SUCCESSFULLY' : 'SOME TESTS FAILED');
  console.log('====================================================');

  process.exit(allPass ? 0 : 1);
}

runMemoryTestSuite().catch((err) => {
  console.error('Unexpected test failure:', err);
  process.exit(1);
});
