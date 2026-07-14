-- ═══════════════════════════════════════════════════════════════
-- Migration : permission accès questions confidentielles
-- Exécuter dans : Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- 1. Ajouter la colonne à la table accounts
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS can_view_confidential BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Permettre à l'app (anon) de modifier ce champ
GRANT UPDATE (can_view_confidential) ON accounts TO anon;

-- 3. Mettre à jour la fonction login() pour retourner ce champ
CREATE OR REPLACE FUNCTION login(p_username TEXT, p_password TEXT)
RETURNS TABLE(id INTEGER, username TEXT, role TEXT, email TEXT, can_view_confidential BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.username, a.role, a.email, a.can_view_confidential
  FROM accounts a
  WHERE a.username = p_username
    AND a.password_hash = crypt(p_password, a.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions inchangées
GRANT EXECUTE ON FUNCTION login(TEXT, TEXT) TO anon;
