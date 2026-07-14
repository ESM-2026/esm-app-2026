# Guide de déploiement — ESM CoachAPP
## app.excellencesportivemonteregie.com

---

## ÉTAPE 1 — Supabase (base de données)

1. Connecte-toi à https://supabase.com et ouvre ton projet **agrtygfmuxqmnsriribp**
2. Dans le menu de gauche → **SQL Editor** → **New query**
3. Colle tout le contenu du fichier `schema.sql` et clique **Run**
4. Vérifie que les tables apparaissent dans **Table Editor**

---

## ÉTAPE 2 — GitHub (hébergement du code)

1. Va sur https://github.com et crée un **nouveau dépôt privé** nommé `esm-app`
2. Sur ton ordinateur, ouvre un terminal dans le dossier `esm-app/` et exécute :

```bash
git init
git add .
git commit -m "Initial ESM CoachAPP"
git branch -M main
git remote add origin https://github.com/TON-USERNAME/esm-app.git
git push -u origin main
```

> **Important :** Ne publie PAS le fichier `.env.local` (il contient tes clés Supabase).
> Ajoute `.env.local` à un fichier `.gitignore` avant le commit.

---

## ÉTAPE 3 — Vercel (déploiement)

1. Va sur https://vercel.com → **Add New Project**
2. Clique **Import Git Repository** → sélectionne `esm-app`
3. Dans **Environment Variables**, ajoute :
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://agrtygfmuxqmnsriribp.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_-NT0yi2nKG9ZqsDVOzmo8Q_sEbDil_6`
4. Clique **Deploy** → attendre 2-3 minutes
5. Vercel te donnera une URL temporaire comme `esm-app.vercel.app` — l'app est déjà fonctionnelle à cette adresse.

---

## ÉTAPE 4 — Domaine personnalisé (GoDaddy → Vercel)

### Dans Vercel :
1. Ouvre ton projet → onglet **Settings** → **Domains**
2. Clique **Add** → entre `app.excellencesportivemonteregie.com`
3. Vercel t'affichera une valeur CNAME à configurer chez GoDaddy (ex: `cname.vercel-dns.com`)

### Dans GoDaddy :
1. Connecte-toi à https://dcc.godaddy.com
2. Sélectionne le domaine `excellencesportivemonteregie.com`
3. **DNS** → **Add New Record**
   - Type : `CNAME`
   - Name (Hôte) : `app`
   - Value (Pointe vers) : `cname.vercel-dns.com`
   - TTL : 600 secondes (ou par défaut)
4. Sauvegarde

> La propagation DNS prend 5 à 60 minutes. Une fois active, `app.excellencesportivemonteregie.com` chargera l'application.

---

## ÉTAPE 5 — Premier accès

| URL | Description |
|-----|-------------|
| `app.excellencesportivemonteregie.com/questionnaire` | Formulaire santé mentale (athlètes) |
| `app.excellencesportivemonteregie.com/journal` | Journal de bord (athlètes) |
| `app.excellencesportivemonteregie.com/login` | Connexion coachs / admin / spécialistes |

**Compte admin par défaut :**
- Utilisateur : `admin`
- Mot de passe : `Admin2024!`
- ⚠️ Changer ce mot de passe immédiatement après le premier accès via le panneau admin.

---

## ÉTAPE 6 — Configuration initiale

Dans le panneau Admin (`/admin`) :
1. **Comptes** → Créer les comptes des entraîneurs et spécialistes
2. **Équipes** → Créer les équipes (nom, école, région)
3. **Athlètes** → Ajouter les athlètes et les assigner aux équipes
4. **Assignations** → Lier les entraîneurs à leurs équipes

---

## Architecture résumée

```
www.excellencesportivemonteregie.com  →  Squarespace (site institutionnel)
app.excellencesportivemonteregie.com  →  Vercel / Next.js (cette app)
                                           └── Supabase (PostgreSQL)
```

## Coûts mensuels

| Service | Plan | Coût |
|---------|------|------|
| Supabase | Free (500 MB, 50K lignes, 2 projets) | 0 $ |
| Vercel | Hobby (projets illimités, SSL inclus) | 0 $ |
| GoDaddy | Domaine déjà payé | 0 $ |
| **Total** | | **0 $** |

> Si l'application prend de l'ampleur (>500 MB de données ou >100K requêtes/jour), envisager le plan Supabase Pro à 25 $/mois.
