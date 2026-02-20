# Shop Password Protection - Implementation Summary

## Overview

Simple password protection for the shop, allowing soft launches and private sales. 
**Status:** Scaffolding complete, ready for admin dashboard integration.

## How It Works

### Current Setup (Environment Variables)

Set in `.env`:

```bash
# Enable password protection
SHOP_PASSWORD=secret123
SHOP_PASSWORD_ENABLED=true
SHOP_PASSWORD_HINT=The year we met (optional hint displayed on gate)
```

**To disable:** Either remove `SHOP_PASSWORD` or set `SHOP_PASSWORD_ENABLED=false`

### User Flow

1. **Visitor goes to `/shop`**
2. **If password protected:** Sees centered password gate with title "Shop Access"
3. **Enters correct password:** Cookie set (7-day expiry), shop content revealed
4. **Wrong password:** Error message, input clears, can retry

### Cookie Behavior

- **Name:** `shop_access`
- **Scope:** `/shop` (only protects shop pages)
- **Expiry:** 7 days
- **HttpOnly:** Yes (secure)

## File Structure

```
src/
├── lib/
│   └── shop-password.ts       # Core logic (config, verification, cookies)
├── components/
│   └── ShopPasswordGate.astro # Password input overlay
├── pages/
│   ├── shop/
│   │   └── index.astro        # Updated to use password gate
│   └── api/
│       └── shop/
│           └── password.ts    # API endpoint for verification
```

## Future Admin Dashboard Integration

When building the admin dashboard, extend `shop-password.ts`:

```typescript
// Add to admin API
export async function updateShopPassword(
  newPassword: string | null,
  enabled: boolean,
  hint?: string
): Promise<void> {
  // Save to database instead of env vars
  // Invalidate existing cookies if password changes
}

export async function getShopPasswordStatus(): Promise<{
  enabled: boolean;
  hasPassword: boolean;
  hint: string | null;
}> {
  // Return current settings (without exposing password)
}
```

### Suggested Admin UI

```
Shop Settings
├── [Toggle] Password Protection: [ON/OFF]
├── [Input]  Password: [••••••] [Change]
├── [Input]  Hint (optional): [The year we met]
└── [Button] Clear All Sessions
```

## Security Notes

1. **Current implementation:** Simple comparison (not bcrypt) — sufficient for soft launch scenario
2. **Cookie signing:** Uses `ADMIN_SECRET` from env (falls back to weak default — change in production!)
3. **Rate limiting:** Not implemented — add if expecting brute force attempts
4. **HTTPS:** Only works securely with HTTPS in production (cookies are secure)

## Testing

1. **Enable protection:**
   ```bash
   SHOP_PASSWORD=test123
   SHOP_PASSWORD_ENABLED=true
   ```

2. **Visit `/shop`** → Should see password gate

3. **Enter wrong password** → Error message

4. **Enter correct password** → Shop content loads

5. **Refresh page** → Still has access (cookie persists)

6. **Disable protection:**
   ```bash
   SHOP_PASSWORD_ENABLED=false
   ```

7. **Visit `/shop`** → Direct access to shop

## Customization

The password gate styling is in `ShopPasswordGate.astro`:
- Colors: Currently black/white minimal aesthetic
- Layout: Centered modal, 400px max width
- Typography: Matches existing site

To customize the look, edit the `<style>` block in the component.

## Edge Cases Handled

- ✅ No password set → Shop is public
- ✅ Password enabled but empty → Shop is public
- ✅ Wrong password → Clear error, can retry
- ✅ Cookie expired → Returns to password gate
- ✅ JavaScript disabled → Form still submits (page reload)
- ✅ Mobile responsive → Works on all screen sizes
