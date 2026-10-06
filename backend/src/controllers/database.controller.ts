import { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService } from '../database/db-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DatabaseController {
  /**
   * GET /api/database/health
   * Requirement 3:
   * Returns connected, database, read, write, update, delete flags.
   * NEVER returns keys or secrets.
   */
  public static async getHealth(_req: Request, res: Response): Promise<void> {
    try {
      const health = await DatabaseService.checkHealth();
      res.status(200).json({
        success: true,
        data: health,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        data: {
          connected: false,
          database: 'supabase',
          read: false,
          write: false,
          update: false,
          delete: false,
          error: error.message || 'Database health check failed.',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * POST /api/database/test
   * Requirement 2:
   * Executes real CREATE -> READ -> UPDATE -> READ AGAIN -> DELETE -> VERIFY DELETE sequence.
   */
  public static async runTest(_req: Request, res: Response): Promise<void> {
    try {
      const result = await DatabaseService.runDiagnosticsTest();
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Diagnostics execution failed.',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * GET /api/database/schema
   * Returns the clean SQL schema so the user can easily copy and run it in the Supabase SQL editor.
   */
  public static async getSchema(_req: Request, res: Response): Promise<void> {
    try {
      const schemaPath = path.resolve(__dirname, '../database/schema.sql');
      let sql = '';
      if (fs.existsSync(schemaPath)) {
        sql = fs.readFileSync(schemaPath, 'utf-8');
      }
      res.status(200).json({
        success: true,
        data: { sql },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
