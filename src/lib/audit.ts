/**
 * Audit Logging System
 * 
 * Tracks all admin actions for security and compliance
 */

import { db } from './db';
import { sql } from 'drizzle-orm';

// Using raw SQL for audit table (optional - can be separate from main schema)
// If you want this in schema.ts instead, let me know

interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string | null;
  username: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  errorMessage: string | null;
}

// In-memory buffer for batch inserts (flush every 10 entries or 30 seconds)
const auditBuffer: AuditLogEntry[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

/**
 * Log an admin action
 */
export async function logAction(
  request: Request,
  userId: string | null,
  username: string | null,
  action: string,
  resource: string,
  resourceId: string | null,
  details: Record<string, unknown>,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  const entry: AuditLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    userId,
    username,
    action,
    resource,
    resourceId,
    details: sanitizeDetails(details),
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent'),
    success,
    errorMessage: errorMessage || null,
  };
  
  auditBuffer.push(entry);
  
  // Flush if buffer is full
  if (auditBuffer.length >= 10) {
    await flushAuditBuffer();
  } else {
    // Schedule flush
    if (!flushTimeout) {
      flushTimeout = setTimeout(() => flushAuditBuffer(), 30000);
    }
  }
  
  // Also log to console for immediate visibility
  console.log(`[AUDIT] ${action} on ${resource}${resourceId ? `/${resourceId}` : ''} by ${username || 'unknown'} - ${success ? 'SUCCESS' : 'FAILED'}`);
}

/**
 * Flush audit buffer to database
 */
async function flushAuditBuffer(): Promise<void> {
  if (auditBuffer.length === 0) return;
  
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  
  const entries = [...auditBuffer];
  auditBuffer.length = 0;
  
  try {
    // Insert using raw SQL
    for (const entry of entries) {
      await db.execute(sql`
        INSERT INTO audit_logs (
          id, timestamp, user_id, username, action, resource, 
          resource_id, details, ip_address, user_agent, success, error_message
        ) VALUES (
          ${entry.id}, ${entry.timestamp}, ${entry.userId}, ${entry.username},
          ${entry.action}, ${entry.resource}, ${entry.resourceId},
          ${JSON.stringify(entry.details)}, ${entry.ipAddress}, 
          ${entry.userAgent}, ${entry.success}, ${entry.errorMessage}
        )
      `);
    }
  } catch (error) {
    console.error('[AUDIT] Failed to write audit logs:', error);
    // Don't throw - audit failures shouldn't break functionality
  }
}

/**
 * Sanitize details to remove sensitive data
 */
function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...details };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'passwordHash', 'token', 'secret', 'apiKey'];
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Get client IP from request
 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return 'unknown';
}

/**
 * Create audit logs table if it doesn't exist
 */
export async function initAuditTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        user_id TEXT,
        username TEXT,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        details JSONB,
        ip_address TEXT,
        user_agent TEXT,
        success BOOLEAN NOT NULL DEFAULT true,
        error_message TEXT
      )
    `);
    
    // Create indexes
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource, resource_id)`);
    
    console.log('[AUDIT] Audit table initialized');
  } catch (error) {
    console.error('[AUDIT] Failed to init audit table:', error);
  }
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(options: {
  userId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<AuditLogEntry[]> {
  const {
    userId, action, resource, resourceId,
    startDate, endDate, limit = 100, offset = 0
  } = options;
  
  let query = sql`SELECT * FROM audit_logs WHERE 1=1`;
  
  if (userId) query = sql`${query} AND user_id = ${userId}`;
  if (action) query = sql`${query} AND action = ${action}`;
  if (resource) query = sql`${query} AND resource = ${resource}`;
  if (resourceId) query = sql`${query} AND resource_id = ${resourceId}`;
  if (startDate) query = sql`${query} AND timestamp >= ${startDate}`;
  if (endDate) query = sql`${query} AND timestamp <= ${endDate}`;
  
  query = sql`${query} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
  
  const result = await db.execute(query);
  return result.rows as AuditLogEntry[];
}

// Convenience functions for common actions
export const AuditActions = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  LOGIN_FAILED: 'login_failed',
  PASSWORD_RESET: 'password_reset',
  PASSWORD_CHANGE: 'password_change',
  
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  RESTORE: 'restore',
  
  UPLOAD: 'upload',
  PROCESS: 'process',
  
  VIEW: 'view',
  EXPORT: 'export',
} as const;

export const AuditResources = {
  USER: 'user',
  WORK: 'work',
  POST: 'post',
  MEDIA: 'media',
  PRODUCT: 'product',
  CATEGORY: 'category',
  SETTINGS: 'settings',
} as const;
