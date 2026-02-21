/**
 * Password Reset API - Request reset link
 * POST /api/admin/forgot-password
 */

import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { passwordResetTokens } from '../../../lib/db/schema';
import { nanoid } from '../../../lib/nanoid';
import crypto from 'node:crypto';

// Admin email(s) - in production, store in env
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@she-skin.com';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate email
    if (!email || email !== ADMIN_EMAIL) {
      // Don't reveal if email exists or not
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'If an account exists, a reset link has been sent.' 
        }), 
        { status: 200 }
      );
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in database
    await db.insert(passwordResetTokens).values({
      id: nanoid(),
      email,
      token,
      expiresAt,
      used: false,
    });

    // Generate reset URL
    const resetUrl = `${request.headers.get('origin') || 'http://localhost:4321'}/admin/reset-password?token=${token}`;

    // TODO: Send actual email here
    // For now, log to console (in production, use Resend, SendGrid, etc.)
    console.log('\n🔐 PASSWORD RESET REQUESTED');
    console.log('================================');
    console.log('Reset URL:', resetUrl);
    console.log('Token:', token);
    console.log('Expires:', expiresAt.toISOString());
    console.log('================================\n');

    // Return success (don't leak token in response)
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'If an account exists, a reset link has been sent.',
        // In dev mode, return the URL so you can see it
        ...(import.meta.env.DEV && { debugUrl: resetUrl })
      }), 
      { status: 200 }
    );

  } catch (error) {
    console.error('Password reset error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process request' }), 
      { status: 500 }
    );
  }
};
