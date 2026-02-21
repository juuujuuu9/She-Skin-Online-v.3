/**
 * Password Reset API - Request reset link
 * POST /api/admin/forgot-password
 */

import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { passwordResetTokens, users } from '../../../lib/db/schema';
import { nanoid } from '../../../lib/nanoid';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { email } = body;

    // Always return success to prevent email enumeration
    const successResponse = {
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.'
    };

    if (!email) {
      return new Response(JSON.stringify(successResponse), { status: 200 });
    }

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !user.isActive) {
      return new Response(JSON.stringify(successResponse), { status: 200 });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in database
    await db.insert(passwordResetTokens).values({
      id: nanoid(),
      userId: user.id,
      token,
      expiresAt,
      used: false,
    });

    // Generate reset URL
    const origin = request.headers.get('origin') || 'http://localhost:4321';
    const resetUrl = `${origin}/admin/reset-password?token=${token}`;

    // TODO: Send actual email here
    // For now, log to console (in production, use Resend, SendGrid, etc.)
    console.log('\n🔐 PASSWORD RESET REQUESTED');
    console.log('================================');
    console.log('Email:', email);
    console.log('Reset URL:', resetUrl);
    console.log('Token:', token);
    console.log('Expires:', expiresAt.toISOString());
    console.log('================================\n');

    // Return success (don't leak token in response)
    return new Response(
      JSON.stringify({ 
        ...successResponse,
        // In dev mode, return the URL so you can see it
        ...(import.meta.env.DEV && { debugUrl: resetUrl })
      }), 
      { status: 200 }
    );

  } catch (error) {
    console.error('Password reset error:', error);
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'If an account exists with this email, a reset link has been sent.'
      }), 
      { status: 200 }
    );
  }
};
