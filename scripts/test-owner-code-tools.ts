import { listSourceFilesTool } from '../backend/src/tools/definitions/list-source-files.tool';
import { readSourceFileTool } from '../backend/src/tools/definitions/read-source-file.tool';
import { searchCodeTool } from '../backend/src/tools/definitions/search-code.tool';
import { validateSourcePath, redactSecrets } from '../backend/src/tools/code-security';

async function runTests() {
  console.log('--- Testing Code Security & Path Validation ---');

  // Test Allowed Paths
  const allowed = [
    'src/App.tsx',
    'backend/src/services/chat.service.ts',
    'ai/brain/context-handler.ts',
    'shared/types/chat.ts',
    'scripts/test-owner-code-tools.ts',
    'backend/src/database/schema.sql',
    'package.json',
    'render.yaml',
    'vite.config.ts',
    '.github/workflows/deploy.yml',
  ];

  for (const p of allowed) {
    const v = validateSourcePath(p, false);
    if (!v.allowed) {
      console.error(`FAIL: Path should be allowed: ${p} (reason: ${v.reason})`);
      process.exit(1);
    }
  }
  console.log('✓ All allowed paths validated successfully.');

  // Test Blocked Paths
  const blocked = [
    '.env',
    '.env.production',
    '.env.local',
    '.git/config',
    'node_modules/express/index.js',
    'dist/index.html',
    '../etc/passwd',
    'src/../../etc/shadow',
    'arbitrary_external.txt',
  ];

  for (const p of blocked) {
    const v = validateSourcePath(p, false);
    if (v.allowed) {
      console.error(`FAIL: Path should be blocked: ${p}`);
      process.exit(1);
    }
  }
  console.log('✓ All blocked paths rejected successfully.');

  // Test Redaction
  const secretSample = `
    const GEMINI_API_KEY = "AIzaSyDummySecretKey1234567890abcdef";
    const DB_URL = "postgresql://myuser:supersecretpass@db.render.com/jexa";
    const OWNER_KEY="mysecretownerkey";
    const bearer = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jV";
  `;
  const redacted = redactSecrets(secretSample);
  if (redacted.includes('AIzaSy') || redacted.includes('supersecretpass') || redacted.includes('mysecretownerkey')) {
    console.error('FAIL: Secret was not redacted:', redacted);
    process.exit(1);
  }
  console.log('✓ Secret redaction passed.');

  // Test Tool Execution: Access Denied when not owner
  const unauthContext = { isOwner: false };
  const deniedList = await listSourceFilesTool.execute({ directory: 'src' }, unauthContext as any);
  if (deniedList.success) {
    console.error('FAIL: Unauthorized user could execute list_source_files');
    process.exit(1);
  }
  console.log('✓ Owner-only guard rejected unauthorized caller.');

  // Test Tool Execution: Authorized owner
  const ownerContext = { isOwner: true, onStatusUpdate: (s: string) => console.log(`  [Status update]: ${s}`) };
  const authList = await listSourceFilesTool.execute({ directory: 'backend/src/services', maxFiles: 10 }, ownerContext as any);
  if (!authList.success || !authList.data || authList.data.files.length === 0) {
    console.error('FAIL: Authorized list_source_files failed:', authList.error);
    process.exit(1);
  }
  console.log(`✓ Authorized list_source_files returned ${authList.data.files.length} files.`);

  // Test read_source_file
  const authRead = await readSourceFileTool.execute({ path: 'package.json', startLine: 1, endLine: 20 }, ownerContext as any);
  if (!authRead.success || !authRead.data || !authRead.data.content.includes('"name"')) {
    console.error('FAIL: Authorized read_source_file failed:', authRead.error);
    process.exit(1);
  }
  console.log(`✓ Authorized read_source_file read ${authRead.data.endLine} lines from package.json.`);

  // Test search_code
  const authSearch = await searchCodeTool.execute({ query: 'ToolRegistry', maxResults: 5 }, ownerContext as any);
  if (!authSearch.success || !authSearch.data || authSearch.data.matches.length === 0) {
    console.error('FAIL: Authorized search_code failed:', authSearch.error);
    process.exit(1);
  }
  console.log(`✓ Authorized search_code found ${authSearch.data.matches.length} matches.`);

  console.log('\nALL CODE READING TOOL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((e) => {
  console.error('Error during testing:', e);
  process.exit(1);
});
