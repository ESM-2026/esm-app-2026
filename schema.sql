-- ═══════════════════════════════════════════════════════════
--  ESM CoachAPP — Schéma complet Supabase
--  Exécuter dans : Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════

-- Extension pour hachage de mots de passe
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Comptes (coachs, spécialistes, admins) ──────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id         SERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin','coach','specialist')),
  email      TEXT,
  region     TEXT,
  school     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Équipes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  region     TEXT,
  school     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Relation équipes ↔ coachs (plusieurs coachs par équipe) ─
CREATE TABLE IF NOT EXISTS team_coaches (
  team_id  INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  coach_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, coach_id)
);

-- ── Athlètes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS athletes (
  id         SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  team_id    INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Questionnaire santé mentale (hebdomadaire) ───────────────
CREATE TABLE IF NOT EXISTS responses (
  id           SERIAL PRIMARY KEY,
  athlete_id   INTEGER REFERENCES athletes(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  -- Général (non inclus dans le calcul d'écart)
  q_general    INTEGER CHECK (q_general BETWEEN 1 AND 5),
  -- Motivation (1-7)
  q_a INTEGER CHECK (q_a BETWEEN 1 AND 7),
  q_b INTEGER CHECK (q_b BETWEEN 1 AND 7),
  q_c INTEGER CHECK (q_c BETWEEN 1 AND 7),
  q_d INTEGER CHECK (q_d BETWEEN 1 AND 7),
  -- Sommeil (1-4)
  q_e INTEGER CHECK (q_e BETWEEN 1 AND 4),
  -- Conciliation (1-5)
  q_f INTEGER CHECK (q_f BETWEEN 1 AND 5),
  -- Anxiété (1-4)
  q_g INTEGER CHECK (q_g BETWEEN 1 AND 4),
  -- Social (1-5)
  q_h INTEGER CHECK (q_h BETWEEN 1 AND 5),
  -- Nutrition (0-4)
  q_i INTEGER CHECK (q_i BETWEEN 0 AND 4),
  q_j INTEGER CHECK (q_j BETWEEN 0 AND 4),
  q_k INTEGER CHECK (q_k BETWEEN 0 AND 4),
  q_l INTEGER CHECK (q_l BETWEEN 0 AND 4),
  q_m INTEGER CHECK (q_m BETWEEN 0 AND 4),
  q_n INTEGER CHECK (q_n BETWEEN 0 AND 4),
  q_o INTEGER CHECK (q_o BETWEEN 0 AND 4),
  q_p INTEGER CHECK (q_p BETWEEN 0 AND 4),
  -- Confidentiel — NE JAMAIS montrer aux coachs
  q_c1 INTEGER CHECK (q_c1 BETWEEN 1 AND 4),
  q_c2 INTEGER CHECK (q_c2 BETWEEN 1 AND 4),
  q_c3 INTEGER CHECK (q_c3 BETWEEN 1 AND 5),
  q_c4 INTEGER CHECK (q_c4 BETWEEN 1 AND 4),
  comment TEXT
);

-- ── Journal de bord hebdomadaire ─────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id                    SERIAL PRIMARY KEY,
  athlete_id            INTEGER REFERENCES athletes(id) ON DELETE CASCADE,
  week_start            DATE NOT NULL,
  submitted_at          TIMESTAMPTZ DEFAULT NOW(),
  coach_response        TEXT,
  coach_responded_at    TIMESTAMPTZ,
  coach_response_read   BOOLEAN DEFAULT FALSE,
  UNIQUE (athlete_id, week_start)
);

-- ── Banque de questions du journal ───────────────────────────
CREATE TABLE IF NOT EXISTS journal_questions (
  id           SERIAL PRIMARY KEY,
  created_by   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  section      TEXT NOT NULL CHECK (section IN ('entrainement','recuperation','objectifs','reflexion','coach')),
  label        TEXT NOT NULL,
  input_type   TEXT NOT NULL CHECK (input_type IN ('number','slider','radio','checkbox','textarea','toggle')),
  options      JSONB,
  min_val      INTEGER,
  max_val      INTEGER,
  is_predefined BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Configuration journal par coach ──────────────────────────
CREATE TABLE IF NOT EXISTS coach_journal_config (
  id            SERIAL PRIMARY KEY,
  coach_id      INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  question_id   INTEGER REFERENCES journal_questions(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  activated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (coach_id, question_id)
);

-- ── Réponses au journal (flexibles) ──────────────────────────
CREATE TABLE IF NOT EXISTS journal_responses (
  id          SERIAL PRIMARY KEY,
  entry_id    INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES journal_questions(id) ON DELETE CASCADE,
  value_number NUMERIC,
  value_text   TEXT,
  value_array  TEXT[]
);

-- ══ DONNÉES INITIALES ════════════════════════════════════════

-- Compte admin par défaut (mot de passe: Admin2024!)
INSERT INTO accounts (username, password_hash, role, email)
VALUES ('admin', crypt('Admin2024!', gen_salt('bf')), 'admin', 'admin@esm.ca')
ON CONFLICT (username) DO NOTHING;

-- Questions prédéfinies du journal
INSERT INTO journal_questions (created_by, section, label, input_type, min_val, max_val, is_predefined, options) VALUES
(NULL,'entrainement','Nombre de séances cette semaine','number',0,14,TRUE,NULL),
(NULL,'entrainement','Heures totales d''entraînement','number',0,40,TRUE,NULL),
(NULL,'entrainement','Intensité perçue globale (RPE) — 1=Très légère, 10=Maximale','slider',1,10,TRUE,NULL),
(NULL,'entrainement','Types de séances (tout ce qui s''applique)','checkbox',NULL,NULL,TRUE,'["Technique / Tactique","Physique","Compétition / Match","Récupération active"]'),
(NULL,'recuperation','Ma récupération cette semaine','radio',1,5,TRUE,'[{"value":1,"label":"1 — Épuisé(e)"},{"value":2,"label":"2"},{"value":3,"label":"3"},{"value":4,"label":"4"},{"value":5,"label":"5 — Parfaitement récupéré(e)"}]'),
(NULL,'recuperation','As-tu eu des douleurs ou une blessure?','toggle',NULL,NULL,TRUE,NULL),
(NULL,'recuperation','Si oui, décris brièvement','textarea',NULL,NULL,TRUE,NULL),
(NULL,'objectifs','Bilan de ton objectif de la semaine passée','radio',NULL,NULL,TRUE,'[{"value":"atteint","label":"✅ Atteint"},{"value":"partiel","label":"🔶 Partiellement atteint"},{"value":"non_atteint","label":"❌ Non atteint"}]'),
(NULL,'objectifs','Mon objectif pour la semaine prochaine','textarea',NULL,NULL,TRUE,NULL),
(NULL,'reflexion','Ce que j''ai le mieux réussi cette semaine','textarea',NULL,NULL,TRUE,NULL),
(NULL,'reflexion','Ce sur quoi je dois encore travailler','textarea',NULL,NULL,TRUE,NULL),
(NULL,'reflexion','Comment je me suis senti(e) globalement','textarea',NULL,NULL,TRUE,NULL),
(NULL,'coach','Message à mon entraîneur (optionnel)','textarea',NULL,NULL,TRUE,NULL)
ON CONFLICT DO NOTHING;

-- ══ FONCTIONS ADMIN ══════════════════════════════════════════

-- Créer un compte avec mot de passe haché
CREATE OR REPLACE FUNCTION create_account(
  p_username TEXT, p_password TEXT, p_role TEXT, p_email TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO accounts (username, password_hash, role, email)
  VALUES (p_username, crypt(p_password, gen_salt('bf')), p_role, p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Réinitialiser le mot de passe d'un compte
CREATE OR REPLACE FUNCTION reset_password(p_account_id INTEGER, p_password TEXT)
RETURNS void AS $$
BEGIN
  UPDATE accounts SET password_hash = crypt(p_password, gen_salt('bf')) WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══ FONCTION LOGIN ═══════════════════════════════════════════
-- Appelée par l'app pour authentifier username + password
CREATE OR REPLACE FUNCTION login(p_username TEXT, p_password TEXT)
RETURNS TABLE(id INTEGER, username TEXT, role TEXT, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.username, a.role, a.email
  FROM accounts a
  WHERE a.username = p_username
    AND a.password_hash = crypt(p_password, a.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══ SÉCURITÉ ROW LEVEL SECURITY (RLS) ════════════════════════
-- Désactiver RLS pour l'instant (l'app gère les permissions elle-même)
ALTER TABLE accounts          DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams             DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_coaches      DISABLE ROW LEVEL SECURITY;
ALTER TABLE athletes          DISABLE ROW LEVEL SECURITY;
ALTER TABLE responses         DISABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries   DISABLE ROW LEVEL SECURITY;
ALTER TABLE journal_questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE coach_journal_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE journal_responses DISABLE ROW LEVEL SECURITY;
