import { ErrorLogService } from '../backend/src/services/error-log.service';
import { ToolRegistry } from '../backend/src/tools/tool-registry';

async function runDiagnosticsVerificationSuite() {
  console.log('====================================================');
  console.log('JEXA SYSTEM CHECK & DIAGNOSTIC TOOLS TEST SUITE');
  console.log('====================================================\n');

  const report: Record<string, 'PASS' | 'FAIL'> = {};

  // --------------------------------------------------------------------------
  // TEST 1: Error Log & Secret Sanitization
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing Error Log Buffer & Secret Sanitization...');
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
  // TEST 2: Diagnostic & Code Tool Availability (No Owner Key Required)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Open Tool Registry Availability...');
  const registry = ToolRegistry.getInstance();

  const declarations = await registry.getToolDeclarations({});
  const hasSystemCheck = declarations.some((t) => t.name === 'system_check');
  const hasRecentErrors = declarations.some((t) => t.name === 'recent_errors');
  const hasListSource = declarations.some((t) => t.name === 'list_source_files');
  const hasReadSource = declarations.some((t) => t.name === 'read_source_file');
  const hasSearchCode = declarations.some((t) => t.name === 'search_code');

  if (hasSystemCheck && hasRecentErrors && hasListSource && hasReadSource && hasSearchCode) {
    console.log('  -> All diagnostic and code-reading tools exposed directly without owner keys.');
    report['Open Tool Exposure'] = 'PASS';
  } else {
    console.error('  -> Tool exposure failed:', {
      hasSystemCheck,
      hasRecentErrors,
      hasListSource,
      hasReadSource,
      hasSearchCode,
    });
    report['Open Tool Exposure'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 3: system_check Tool Execution
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing system_check Tool Execution...');
  const systemCheckTool = registry.getTool('system_check')!;

  const execRes = await systemCheckTool.execute({}, {});

  const envVars = execRes.data?.environmentVariables;
  const hasEnvNamesOnly =
    Array.isArray(envVars?.set) &&
    Array.isArray(envVars?.missing) &&
    !JSON.stringify(envVars).includes('AIzaSy');

  const checksValid =
    execRes.success &&
    Boolean(execRes.data?.server?.uptimeFormatted) &&
    hasEnvNamesOnly;

  if (checksValid) {
    console.log('  -> system_check executed safely; verified server uptime and env vars without exposing secrets.');
    report['system_check Execution'] = 'PASS';
  } else {
    console.error('  -> system_check failed:', execRes);
    report['system_check Execution'] = 'FAIL';
  }

  // --------------------------------------------------------------------------
  // TEST 4: recent_errors Tool Execution
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing recent_errors Tool Execution...');
  const recentErrorsTool = registry.getTool('recent_errors')!;

  const errorsExec = await recentErrorsTool.execute({ limit: 5 }, {});

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

runDiagnosticsVerificationSuite().catch((err) => {
  console.error('Unexpected test failure:', err);
  process.exit(1);
});
