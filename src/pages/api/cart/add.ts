import type { APIRoute } from 'astro';
import { 
  getCartIdFromRequest, 
  createCart, 
  addCartItem,
  getCartForApp,
  CART_COOKIE_NAME,
  CART_COOKIE_MAX_AGE 
} from '@lib/db/queries';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { productId, quantity = 1, size } = await request.json();
    
    if (!productId || quantity < 1) {
      return new Response(JSON.stringify({ error: 'Invalid product or quantity' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let cartId = getCartIdFromRequest(request);
    let isNewCart = false;
    
    if (!cartId) {
      cartId = await createCart();
      isNewCart = true;
    }

    const addedKey = await addCartItem(cartId, productId, quantity, size ?? null);
    const cart = await getCartForApp(cartId);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isNewCart) {
      headers['Set-Cookie'] = `${CART_COOKIE_NAME}=${cartId}; Path=/; Max-Age=${CART_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`;
    }

    return new Response(JSON.stringify({ cart, addedKey }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to add item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
