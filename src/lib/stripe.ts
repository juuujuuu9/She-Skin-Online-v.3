/**
 * Stripe Integration
 * 
 * Using Stripe Checkout Links (no backend logic required)
 * Products store their checkout URLs directly in the database
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not set');
}

// Initialize Stripe (server-side only)
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

/**
 * Create a Stripe Checkout Link for a product
 */
export async function createCheckoutLink(params: {
  priceId: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { productName: params.productName },
  });
  return session.url || '';
}

/**
 * Create a Payment Link (reusable)
 */
export async function createPaymentLink(params: {
  priceId: string;
  productName: string;
}): Promise<string> {
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: params.priceId, quantity: 1 }],
    metadata: { productName: params.productName },
  });
  return paymentLink.url;
}
