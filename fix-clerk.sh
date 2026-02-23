#!/bin/bash
# Fix SheSkin Clerk 400 Error - Relink Vercel Project

cd /Users/user/Development/sheskin/repo

echo "=== Step 1: Remove old Vercel link ==="
rm -rf .vercel

echo "=== Step 2: Link to correct project (she-skin-online-v-3) ==="
vercel link

# When prompted, select:
# - "Use existing project" → "she-skin-online-v-3"

echo "=== Step 3: Verify link ==="
cat .vercel/project.json

echo ""
echo "=== Step 4: Pull environment variables ==="
vercel env pull .env.production

echo ""
echo "Done! Now check .env.production for correct Clerk keys."
