/**
 * Password Reset API - Set new password
 * POST /api/admin/reset-password
 */

import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { passwordResetTokens } from '../../../lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';

// In production, use bcrypt. For now, simple comparison
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return new Response(
        JSON.stringify({ error: 'Token and new password are required' }), 
        { status: 400 }
      );
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters' }), 
        { status: 400 }
      );
    }

    // Find valid token
    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false),
        gt(passwordResetTokens.expiresAt, new Date())
      ),
    });

    if (!resetToken) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }), 
        { status: 400 }
      );
    }

    // Mark token as used
    await db.update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, resetToken.id));

    // Update password in .env file (simple approach)
    const envPath = resolve(process.cwd(), '.env');
    try {
      let envContent = readFileSync(envPath, 'utf-8');
      
      // Replace existing password or add new one
      if (envContent.includes('ADMIN_PASSWORD=')) {
        envContent = envContent.replace(
          /ADMIN_PASSWORD=.*/,
          `ADMIN_PASSWORD=${newPassword}`
        );
      } else {
        envContent += `\nADMIN_PASSWORD=${newPassword}\n`;
      }
      
      writeFileSync(envPath, envContent);
    } catch (err) {
      console.error('Failed to update .env:', err);
      return new Response(
        JSON.stringify({ error: 'Failed to update password' }), 
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Password updated successfully. Please log in with your new password.'
      }), 
      { status: 200 }
    );

  } catch (error) {
    console.error('Password reset error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to reset password' }), 
      { status: 500 }
    );
  }
};
