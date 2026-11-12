-- Keep a failed job's machine-readable error code (e.g. tiktok_setup_required) next to its message.
ALTER TABLE jobs ADD COLUMN error_code TEXT;
