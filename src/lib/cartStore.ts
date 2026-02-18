/**
 * Cart Store using nanostores
 */

import { atom } from 'nanostores';
import type { Cart } from './types';

export interface CartStore {
  cart: Cart | null;
  isLoading: boolean;
  error: string | null;
}

const initialCartState: CartStore = {
  cart: null,
  isLoading: false,
  error: null,
};

export const cartStore = atom<CartStore>(initialCartState);
export const cartTrayOpenStore = atom<boolean>(false);

export function setCartTrayOpen(open: boolean): void {
  cartTrayOpenStore.set(open);
}

export async function fetchCartFromServer(): Promise<void> {
  setCartLoading(true);
  setCartError(null);
  try {
    const res = await fetch('/api/cart', { method: 'GET', credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load cart');
    const cart: Cart = await res.json();
    setCart(cart);
  } catch (err) {
    setCartError(err instanceof Error ? err.message : 'Failed to load cart');
    setCart(null);
  } finally {
    setCartLoading(false);
  }
}

export async function addItemToCart(
  productId: string,
  quantity: number,
  size?: string
): Promise<string | null> {
  setCartLoading(true);
  setCartError(null);
  try {
    const res = await fetch('/api/cart/add', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity, size: size ?? undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to add to cart');
    }
    const data: { cart: Cart; addedKey: string } = await res.json();
    setCart(data.cart);
    return data.addedKey;
  } catch (err) {
    setCartError(err instanceof Error ? err.message : 'Failed to add to cart');
    return null;
  } finally {
    setCartLoading(false);
  }
}

export async function updateCartItemQuantity(key: string, quantity: number): Promise<void> {
  setCartError(null);
  try {
    const res = await fetch('/api/cart', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, quantity }),
    });
    if (!res.ok) throw new Error('Failed to update cart');
    const data: { cart: Cart } = await res.json();
    setCart(data.cart);
  } catch (err) {
    setCartError(err instanceof Error ? err.message : 'Failed to update');
  }
}

export async function removeCartItem(key: string): Promise<void> {
  setCartError(null);
  try {
    const res = await fetch(`/api/cart/items/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to remove item');
    const data: { cart: Cart } = await res.json();
    setCart(data.cart);
  } catch (err) {
    setCartError(err instanceof Error ? err.message : 'Failed to remove');
  }
}

export function setCart(cart: Cart | null): void {
  cartStore.set({ ...cartStore.get(), cart });
}

export function setCartLoading(isLoading: boolean): void {
  cartStore.set({ ...cartStore.get(), isLoading });
}

export function setCartError(error: string | null): void {
  cartStore.set({ ...cartStore.get(), error });
}

export function resetCart(): void {
  cartStore.set(initialCartState);
}
