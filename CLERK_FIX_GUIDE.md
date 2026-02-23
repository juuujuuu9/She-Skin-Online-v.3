# Clerk Environment Configuration Fix

## Current Problem
The `.env` file has TEST keys that won't work for production:
- `PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...` (TEST KEY)
- `CLERK_SECRET_KEY=sk_test_...` (TEST KEY)

## Required Fix

### Option A: Get LIVE Keys from Clerk Dashboard

1. Go to https://dashboard.clerk.com
2. Select your "She Skin" application
3. Navigate to "API Keys" in the left sidebar
4. Switch to "Production" instance (top dropdown)
5. Copy these values:
   - **Publishable key**: `pk_live_...` (starts with pk_live_)
   - **Secret key**: `sk_live_...` (starts with sk_live_)

### Option B: Update Vercel Environment Variables

The Vercel project `she-skin-online-v-3` likely has the correct LIVE keys already set. After relinking (Step 1), run:

```bash
cd /Users/user/Development/sheskin/repo
vercel env pull .env.production
```

This will download the production environment variables.

## Environment Variables Reference

| Variable | Current (WRONG) | Should Be (PRODUCTION) |
|----------|----------------|----------------------|
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_YXBwYXJlbnQtbGFicmFkb3ItMjQuY2xlcmsuYWNjb3VudHMuZGV2JA` | `pk_live_...` |
| `CLERK_SECRET_KEY` | `sk_test_QrnBw7lcAWBuu7T6nwM7eO1AQ9uew2l6zZsH9vhf9L` | `sk_live_...` |
| `PUBLIC_CLERK_DOMAIN` | `clerk.sheskinv3.thoughtform.world` | ✅ Already correct |
| `PUBLIC_CLERK_PROXY_URL` | `https://clerk.sheskinv3.thoughtform.world` | ✅ Already correct |

## Domain Configuration (Already Correct ✅)

Your Clerk dashboard is correctly configured:
- Custom domain: `clerk.sheskinv3.thoughtform.world`
- Home URL: `https://sheskinv3.thoughtform.world`
- Instance type: Production

## Correct URLs

| Environment | URL |
|-------------|-----|
| **Production (LIVE)** | `https://sheskinv3.thoughtform.world/admin/login` |
| **Wrong URL (causes 400 error)** | `https://she-skin-online-v-3.vercel.app/admin/login` |

## After Fixing

1. Use the correct URL: `https://sheskinv3.thoughtform.world/admin/login`
2. The Clerk 400 error will disappear
3. Login will work correctly

## Quick Test

After fixing, test with:
```bash
# Pull production env vars
vercel env pull .env.production

# Build locally to verify
npm run build
```
