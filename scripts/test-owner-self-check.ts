import { checkOwnerStatus } from '../backend/src/middleware/auth.middleware';
import { ErrorLogService } from '../backend/src/services/error-log.service';
import { ToolRegistry } from '../backend/src/tools/tool-registry';

async function runOwnerVerificationSuite() {
  console.log('====================================================');
  console.log('JEXA OWNER-ONLY SELF-CHECK & DIAGNOSTICS TEST SUITE');
  console.log('====================================================\n');

  const report: Record<string, 'PASS' | 'FAIL'> = {};

  // --------------------------------------------------------------------------
  // TEST 1: Owner Lock Verification
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing Owner Lock & Header Authorization...');
  const prevKey = process.env.OWNER_ACCESS_KEY;

  delete process.env.OWNER_ACCESS_KEY;
  const mockReq1 = { headers: { 'x-owner-key': 'some-key' } } as any;
  const isOwnerUnset = checkOwnerStatus(mockReq1);

  process.env.OWNER_ACCESS_KEY = 'test-owner-secret-9988';
  const mockReqWrong = { headers: { 'x-owner-key': 'wrong-key' } } as any;
  const isOwnerWrong = checkOwnerStatus(mockReqWrong);

  const mockReqCorrect = { headers: { 'x-owner-key': 'test-owner-secret-9988' } } as any;
  const isOwnerCorrect = checkOwnerStatus(mockReqCorrect);

  if (!isOwnerUnset && !isOwnerWrong && isOwnerCorrect) {
    console.log('  -> Owner lock correctly restricts authorization strictly to matching key, and denies when unset.');
    report['Owner Lock Authorization'] = 'PASS';
  } else {
    console.error('  -> Owner lock failed:', { isOwnerUnset, isOwnerWrong, isOwnerCorrect });
    report['Owner Lock Authorization'] = 'FAIL';
  }

  // Restore env
  if (prevKey) {
    process.env.OWNER_ACCESS_KEY = prevKey;
  } else {
    process.env.OWNER_ACCESS_KEY = 'test-owner-secret-9988';
  }

  // --------------------------------------------------------------------------
  // TEST 2: Error Log & Secret Sanitization
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Error Log Buffer & Secret Sanitization...');
  ErrorLogService.clearBuffer();

  const loggedEntry = ErrorLogService.log('chat', 'Error: sk-proj-1234567890abcdef123456 failed with Bearer secret-auth-token-123', {
    connectionString: 'postgresql://admin:superSecretPass123@db.supabase.co:5432/postgres',
    geminiKey: 'AIzaSyA12345678901234567890123456789012',
    apiKey: 'sk-live-secret-test-key-55667788',
  });

  const recent = await ErrorLogService.getRecentErrors(10);
  const hasEntry = recent.some((e) => e.id === loggedEntry.id);
  const scrubbedMsg = loggedEntry.message;
  const scrubbedDetails = JSON.stringify(loggedEntry.details);

  const secretsClean =
    !scrubbedMsg.includes('sk-proj-') &&
    !scrubbedMsg.includes('secret-auth-token-123') &&
    !scrubbedDetails.includes('superSecretPass123') &&
    !scrubbedDetails.includes('AIzaSyA12345678901234567890123456789012') &&
    !scrubbedDetails.includes('sk-live-secret');

  if (hasEntry && secretsClean) {
    console.log('  -> Errors buffered cleanly with complete secret redaction.');
    report['Error Log & Secrets Redaction'] = 'PASS';
  } else {
    console.error('  -> Error log failed:', { hasEntry, scrubbedMsg, scrubbedDetails });
    report['Error Log & Secrets Redaction'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 3: ToolRegistry Owner-Only Availability
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Tool Registry Owner Guard...');
  const registry = ToolRegistry.getInstance();

  const publicDeclarations = await registry.getToolDeclarations({ isOwner: false });
  const ownerDeclarations = await registry.getToolDeclarations({ isOwner: true });

  const publicHasSystemCheck = publicDeclarations.some((t) => t.name === 'system_check');
  const publicHasRecentErrors = publicDeclarations.some((t) => t.name === 'recent_errors');

  const ownerHasSystemCheck = ownerDeclarations.some((t) => t.name === 'system_check');
  const ownerHasRecentErrors = ownerDeclarations.some((t) => t.name === 'recent_errors');

  if (!publicHasSystemCheck && !publicHasRecentErrors && ownerHasSystemCheck && ownerHasRecentErrors) {
    console.log('  -> Tools hidden from public/regular sessions, exposed only to verified owner.');
    report['Owner-Only Tool Exposure'] = 'PASS';
  } else {
    console.error('  -> Tool exposure failed:', {
      publicHasSystemCheck,
      publicHasRecentErrors,
      ownerHasSystemCheck,
      ownerHasRecentErrors,
    });
    report['Owner-Only Tool Exposure'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 4: system_check Tool Execution
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing system_check Tool Execution...');
  const systemCheckTool = registry.getTool('system_check')!;

  // Execution as non-owner
  const nonOwnerExec = await systemCheckTool.execute({}, { isOwner: false });

  // Execution as owner
  let statusEmitted = '';
  const ownerExec = await systemCheckTool.execute(
    {},
    {
      isOwner: true,
      onStatusUpdate: (s) => {
        statusEmitted = s;
      },
    }
  );

  const envVars = ownerExec.data?.environmentVariables;
  // Ensure names only, no values
  const hasEnvNamesOnly =
    Array.isArray(envVars?.set) &&
    Array.isArray(envVars?.missing) &&
    !JSON.stringify(envVars).includes('test-owner-secret-9988');

  const checksValid =
    !nonOwnerExec.success &&
    ownerExec.success &&
    Boolean(ownerExec.data?.server?.uptimeFormatted) &&
    Boolean(ownerExec.data?.database?.tablesChecked) &&
    hasEnvNamesOnly;

  if (checksValid) {
    console.log('  -> system_check executed safely; verified server uptime, DB tables, and env vars without exposing secrets.');
    report['system_check Execution'] = 'PASS';
  } else {
    console.error('  -> system_check failed:', { nonOwnerExec, ownerExec });
    report['system_check Execution'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 5: recent_errors Tool Execution
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing recent_errors Tool Execution...');
  const recentErrorsTool = registry.getTool('recent_errors')!;

  const errorsExec = await recentErrorsTool.execute({ limit: 5 }, { isOwner: true });

  if (errorsExec.success && errorsExec.data && Array.isArray(errorsExec.data.errors)) {
    console.log(`  -> recent_errors returned ${errorsExec.data.errors.length} sanitized log entries.`);
    report['recent_errors Execution'] = 'PASS';
  } else {
    console.error('  -> recent_errors failed:', errorsExec);
    report['recent_errors Execution'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log('TEST SUITE REPORT:');
  console.log('====================================================');
  let allPass = true;
  for (const [name, status] of Object.entries(report)) {
    console.log(`${name.padEnd(35)}: ${status}`);
    if (status !== 'PASS') allPass = false;
  }
  console.log('====================================================');
  console.log('RESULT:', allPass ? 'ALL TESTS PASSED SUCCESSFULLY' : 'SOME TESTS FAILED');
  console.log('====================================================');

  process.exit(allPass ? 0 : 1);
}

runOwnerVerificationSuite().catch((err) => {
  console.error('Unexpected test failure:', err);
  process.exit(1);
});
