use std::path::PathBuf;

use crate::constants::{APP_SUPPORT_DIR_NAME, DATA_DIR_NAME};

/// Migrate data directories from old names to new names on startup.
///
/// Currently a no-op because DATA_DIR_NAME is still ".screenpipe".
/// When Phase 3 flips the constant to ".thadm", this will detect
/// the old directory and rename it automatically.
pub fn migrate_data_dir() {
    // Home data directory: ~/.screenpipe → ~/.thadm
    if let Some(home) = dirs::home_dir() {
        let old = home.join(".screenpipe");
        let new = home.join(DATA_DIR_NAME);
        migrate_dir(&old, &new);
    }

    // App Support directory: ~/Library/Application Support/screenpipe → .../thadm
    if let Some(local_data) = dirs::data_local_dir() {
        let old = local_data.join("screenpipe");
        let new = local_data.join(APP_SUPPORT_DIR_NAME);
        migrate_dir(&old, &new);
    }
}

fn migrate_dir(old: &PathBuf, new: &PathBuf) {
    // No-op if old and new are the same path (constant hasn't been flipped yet)
    if old == new {
        return;
    }

    if old.exists() && !new.exists() {
        // Atomic rename (same filesystem under $HOME)
        match std::fs::rename(old, new) {
            Ok(()) => {
                eprintln!("[MIGRATION] Moved {} -> {}", old.display(), new.display());
            }
            Err(e) => {
                // rename failed (e.g., cross-device) — don't delete old dir
                eprintln!(
                    "[MIGRATION] Failed to rename {} -> {}: {}. Data stays at old location.",
                    old.display(),
                    new.display(),
                    e
                );
            }
        }
    } else if old.exists() && new.exists() {
        eprintln!(
            "[MIGRATION] Both {} and {} exist. Using {}.",
            old.display(),
            new.display(),
            new.display()
        );
    }
    // Otherwise: nothing to migrate (fresh install or already migrated)
}
