CREATE TABLE apps (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER apps_updated_at
  BEFORE UPDATE ON apps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- BigQuery datasets linked to an app (one app can have many)
CREATE TABLE app_datasets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id         UUID        NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  label          TEXT        NOT NULL,  -- e.g. "Production", "Staging"
  gcp_project_id TEXT        NOT NULL,
  dataset_id     TEXT        NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(app_id, gcp_project_id, dataset_id)
);

-- Users who can access an app
CREATE TABLE app_members (
  app_id     UUID        NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (app_id, user_id)
);

-- Entity files uploaded for an app (metadata; content lives in Supabase Storage)
CREATE TABLE app_files (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id       UUID  NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  file_path    TEXT  NOT NULL,    -- path within the zip, e.g. "src/entities/user.entity.ts"
  storage_path TEXT  NOT NULL,    -- path in Supabase Storage bucket
  category     TEXT,              -- "entity", "model", "schema", etc.
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
