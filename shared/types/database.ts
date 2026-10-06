export type TestStepStatus = 'PASS' | 'FAIL' | 'NOT_TESTED';

export interface DatabaseTestStep {
  status: TestStepStatus;
  latencyMs?: number;
  message?: string;
  error?: string;
}

export interface DatabaseDiagnosticsResult {
  overall: 'PASS' | 'FAIL';
  database: 'supabase' | 'memory';
  configured: boolean;
  connection: DatabaseTestStep;
  create: DatabaseTestStep;
  read: DatabaseTestStep;
  update: DatabaseTestStep;
  delete: DatabaseTestStep;
  chatPersistence: DatabaseTestStep;
  settingsPersistence: DatabaseTestStep;
  testedAt: string;
  totalLatencyMs: number;
  notes?: string[];
}

export interface DatabaseHealthResponse {
  connected: boolean;
  database: 'supabase' | 'memory';
  read: boolean;
  write: boolean;
  update: boolean;
  delete: boolean;
  chatPersistence?: boolean;
  settingsPersistence?: boolean;
  latencyMs?: number;
  timestamp: string;
  error?: string;
}
