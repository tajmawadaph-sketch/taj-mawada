# Archived legacy migrations (version 20261010)

These ten SQL files are preserved here with their original filenames and contents. They shared the same migration version (`20261010`), so they cannot coexist as separate active entries in `supabase/migrations`.

The active migration chain uses `supabase/migrations/20261010110000_remote_public_schema_baseline.sql` as the snapshot of the existing remote public schema. Do not apply these archived files individually. Before deploying the active chain, verify that the remote schema still matches the baseline and reconcile migration history by marking the baseline as applied; then apply only the subsequent uniquely versioned migrations.