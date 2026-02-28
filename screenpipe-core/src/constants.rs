use std::path::PathBuf;

/// Default data directory name under $HOME (e.g., ~/.thadm).
/// Mirror in screenpipe-app-tauri/src-tauri/src/constants.rs — keep in sync.
pub const DATA_DIR_NAME: &str = ".thadm";

/// Default app support directory name under local_data_dir
/// (e.g., ~/Library/Application Support/thadm).
/// Mirror in screenpipe-app-tauri/src-tauri/src/constants.rs — keep in sync.
pub const APP_SUPPORT_DIR_NAME: &str = "thadm";

/// Migrate data directories from old names to new names.
///
/// Detects old ".screenpipe" / "screenpipe" directories and renames them
/// to the current DATA_DIR_NAME / APP_SUPPORT_DIR_NAME (".thadm" / "thadm").
pub fn migrate_data_dir() {
    if let Some(home) = dirs::home_dir() {
        let old = home.join(".screenpipe");
        let new = home.join(DATA_DIR_NAME);
        migrate_dir(&old, &new);
    }

    if let Some(local_data) = dirs::data_local_dir() {
        let old = local_data.join("screenpipe");
        let new = local_data.join(APP_SUPPORT_DIR_NAME);
        migrate_dir(&old, &new);
    }
}

fn migrate_dir(old: &PathBuf, new: &PathBuf) {
    if old == new {
        return;
    }

    if old.exists() && !new.exists() {
        match std::fs::rename(old, new) {
            Ok(()) => {
                eprintln!("[MIGRATION] Moved {} -> {}", old.display(), new.display());
            }
            Err(e) => {
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
}
