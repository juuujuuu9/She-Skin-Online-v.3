/**
 * Password Reset API - Set new password
 * POST /api/admin/reset-password
 */

import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { passwordResetTokens, users } from '../../../lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { hashPassword } from '../../../lib/admin-auth';

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

    // Hash new password and update user
    const passwordHash = await hashPassword(newPassword);
    
    await db.update(users)
      .set({ 
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, resetToken.userId));

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
