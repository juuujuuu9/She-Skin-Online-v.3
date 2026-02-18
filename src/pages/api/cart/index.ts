import type { APIRoute } from 'astro';
import { 
  getCartIdFromRequest, 
  createCart, 
  getCartForApp,
  CART_COOKIE_NAME,
  CART_COOKIE_MAX_AGE 
} from '@lib/db/queries';

export const GET: APIRoute = async ({ request }) => {
  const cartId = getCartIdFromRequest(request) ?? await createCart();
  const cart = await getCartForApp(cartId);
  
  return new Response(JSON.stringify(cart), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${CART_COOKIE_NAME}=${cartId}; Path=/; Max-Age=${CART_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`,
    },
  });
};
