# AniXOS — Guide de Build

## 🚀 Démarrage rapide

```bash
# 1. Vérifier les prérequis
node setup.mjs --only=prereqs

# 2. Copier et remplir .env.setup
cp .env.setup.example .env.setup
# Éditez .env.setup (SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF)

# 3. Copier et remplir apps/web/.env.local
cp apps/web/.env.local.example apps/web/.env.local
# Éditez apps/web/.env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)

# 4. Tout construire
node setup.mjs --all

# OU en interactif
node setup.mjs