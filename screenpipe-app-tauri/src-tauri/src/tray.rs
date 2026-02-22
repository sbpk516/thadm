use crate::commands::show_main_window;
use crate::health::{get_recording_status, RecordingStatus};
use crate::sidecar::{read_license_fields, SidecarState};
use crate::store::{get_store, OnboardingStore};
use crate::updates::is_source_build;
use crate::window_api::ShowRewindWindow;
use anyhow::Result;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::tray::TrayIcon;
use tauri::Emitter;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    AppHandle, Manager, Wry,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

use tracing::{debug, error, info};

fn show_notification(app: &AppHandle, title: &str, body: &str) {
    // Guard: app.emit() crashes with objc_id null pointer when webview is inactive
    // (window hidden via LSUIElement). Only emit if a webview window exists and is visible.
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = app.emit("notification-requested", serde_json::json!({
                "title": title,
                "body": body,
            }));
            return;
        }
    }
    info!("{}: {}", title, body);
}

// Track last known state to avoid unnecessary updates
static LAST_MENU_STATE: Lazy<Mutex<MenuState>> = Lazy::new(|| Mutex::new(MenuState::default()));

#[derive(Default, PartialEq, Clone)]
struct MenuState {
    shortcuts: HashMap<String, String>,
    recording_status: Option<RecordingStatus>,
    onboarding_completed: bool,
    read_only_mode: bool,
}

pub fn setup_tray(app: &AppHandle, update_item: &tauri::menu::MenuItem<Wry>) -> Result<()> {
    if let Some(main_tray) = app.tray_by_id("thadm_main") {
        // Initial menu setup with empty state
        let menu = create_dynamic_menu(app, &MenuState::default(), update_item)?;
        main_tray.set_menu(Some(menu))?;

        // Setup click handlers
        setup_tray_click_handlers(&main_tray)?;

        // Start menu updater
        setup_tray_menu_updater(app.clone(), update_item);
    }
    Ok(())
}

fn create_dynamic_menu(
    app: &AppHandle,
    _state: &MenuState,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<tauri::menu::Menu<Wry>> {
    let store = get_store(app, None)?;
    let mut menu_builder = MenuBuilder::new(app);

    // Check if onboarding is completed
    let onboarding_completed = OnboardingStore::get(app)
        .ok()
        .flatten()
        .map(|o| o.is_completed)
        .unwrap_or(false);

    // During onboarding: show minimal menu (version + quit only)
    if !onboarding_completed {
        menu_builder = menu_builder
            .item(
                &MenuItemBuilder::with_id("version", format!("version {}", app.package_info().version))
                    .enabled(false)
                    .build(app)?,
            )
            .item(&PredefinedMenuItem::separator(app)?)
            .item(&MenuItemBuilder::with_id("quit", "quit thadm").build(app)?);

        return menu_builder.build().map_err(Into::into);
    }

    // Full menu after onboarding is complete
    let default_shortcut = if cfg!(target_os = "windows") {
        "Alt+S"
    } else {
        "Control+Super+S"
    };
    let show_shortcut = store
        .get("showScreenpipeShortcut")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| default_shortcut.to_string());

    // Search History
    menu_builder = menu_builder.item(
        &MenuItemBuilder::with_id(
            "show",
            format!("Search History            {}", format_shortcut(&show_shortcut)),
        )
        .build(app)?,
    );

    // Recording status
    let recording_status = get_recording_status();
    let status_text = match recording_status {
        RecordingStatus::Recording => "● Recording",
        RecordingStatus::Stopped => "○ Stopped",
        RecordingStatus::Error => "○ Error",
    };
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(
            &MenuItemBuilder::with_id("recording_status", status_text)
                .enabled(false)
                .build(app)?,
        );

    // Contextual recording control — show only the relevant action
    let dev_mode = store
        .get("devMode")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Check license/trial state from live store
    let read_only_mode = read_license_fields(app).is_read_only_mode();

    if !dev_mode {
        menu_builder = menu_builder
            .item(&PredefinedMenuItem::separator(app)?);
        if read_only_mode {
            menu_builder = menu_builder
                .item(&MenuItemBuilder::with_id("trial_expired", "Trial Expired — Buy Thadm").build(app)?);
        } else {
            match recording_status {
                RecordingStatus::Recording => {
                    menu_builder = menu_builder
                        .item(&MenuItemBuilder::with_id("stop_recording", "Stop Recording").build(app)?);
                }
                _ => {
                    menu_builder = menu_builder
                        .item(&MenuItemBuilder::with_id("start_recording", "Start Recording").build(app)?);
                }
            }
        }
    }

    // Update item — only for non-source builds
    if !is_source_build(app) {
        menu_builder = menu_builder
            .item(&PredefinedMenuItem::separator(app)?)
            .item(update_item);
    }

    // Settings and feedback
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("settings", "Settings...").build(app)?)
        .item(&MenuItemBuilder::with_id("feedback", "Send Feedback").build(app)?);

    // Quit with version
    let version = app.package_info().version.to_string();
    let is_beta = app.config().identifier.contains("beta");
    let quit_text = if is_beta {
        format!("Quit thadm                v{} (beta)", version)
    } else {
        format!("Quit thadm                v{}", version)
    };
    menu_builder = menu_builder
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("quit", &quit_text).build(app)?);

    menu_builder.build().map_err(Into::into)
}

fn setup_tray_click_handlers(main_tray: &TrayIcon) -> Result<()> {
    main_tray.on_menu_event(move |app_handle, event| {
        handle_menu_event(app_handle, event);
    });

    Ok(())
}

fn handle_menu_event(app_handle: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "show" => {
            show_main_window(app_handle, false);
        }
        "start_recording" => {
            info!("[TRAY_START] start_recording menu item clicked");
            let app = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                info!("[TRAY_START] async task started, getting SidecarState...");
                if let Some(sidecar_state) = app.try_state::<SidecarState>() {
                    info!("[TRAY_START] SidecarState found, calling spawn_screenpipe...");
                    match crate::sidecar::spawn_screenpipe(
                        sidecar_state,
                        app.clone(),
                        None,
                    )
                    .await
                    {
                        Ok(_) => {
                            info!("[TRAY_START] spawn_screenpipe returned Ok");
                            show_notification(&app, "thadm", "Recording started");
                        }
                        Err(e) => {
                            error!("[TRAY_START] spawn_screenpipe returned Err: {}", e);
                            // If permission error, open the permission recovery window
                            if e.contains("permission") {
                                if let Err(show_err) = ShowRewindWindow::PermissionRecovery.show(&app) {
                                    error!("[TRAY_START] Failed to show permission recovery: {}", show_err);
                                }
                            } else {
                                show_notification(&app, "thadm", &format!("Failed to start: {}", e));
                            }
                        }
                    }
                } else {
                    error!("[TRAY_START] SidecarState NOT found in app state!");
                }
            });
        }
        "stop_recording" => {
            let app = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(sidecar_state) = app.try_state::<SidecarState>() {
                    match crate::sidecar::stop_screenpipe(
                        sidecar_state,
                        app.clone(),
                    )
                    .await
                    {
                        Ok(_) => {
                            info!("Recording stopped from tray menu");
                            show_notification(&app, "thadm", "Recording stopped");
                        }
                        Err(e) => {
                            error!("Failed to stop recording from tray: {}", e);
                            show_notification(&app, "thadm", &format!("Failed to stop: {}", e));
                        }
                    }
                }
            });
        }
        "trial_expired" => {
            let _ = app_handle.opener().open_url("https://kalam-plus.com/thadm", None::<&str>);
        }
        "update_now" => {
            // For source builds, show info dialog about updates
            if is_source_build(app_handle) {
                let app = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let dialog = app
                        .dialog()
                        .message(
                            "auto-updates are only available in the pre-built version.\n\n\
                            source builds require manual updates from github.",
                        )
                        .title("source build detected")
                        .buttons(MessageDialogButtons::OkCancelCustom(
                            "download pre-built".to_string(),
                            "view on github".to_string(),
                        ));

                    dialog.show(move |clicked_download| {
                        if clicked_download {
                            let _ = app.opener().open_url("https://screenpi.pe/download", None::<&str>);
                        } else {
                            let _ = app.opener().open_url("https://github.com/mediar-ai/screenpipe/releases", None::<&str>);
                        }
                    });
                });
            } else {
                // For production builds, emit event to trigger update
                let _ = app_handle.emit("update-now-clicked", ());
            }
        }
        "settings" => {
            info!("Opening settings window from tray");
            match (ShowRewindWindow::Settings { page: None }).show(app_handle) {
                Ok(window) => {
                    info!("Settings window opened successfully");
                    // Ensure the window is visible and focused
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                Err(e) => {
                    error!("Failed to open settings window: {:?}", e);
                }
            }
        }
        "feedback" => {
            let _ = ShowRewindWindow::Settings { page: Some("feedback".to_string()) }.show(app_handle);
        }
        "onboarding" => {
            // Reset onboarding state so it shows even if previously completed
            let _ = OnboardingStore::update(app_handle, |onboarding| {
                onboarding.reset();
            });
            let _ = ShowRewindWindow::Onboarding.show(app_handle);
        }
        "quit" => {
            debug!("Quit requested");

            // Stop the sidecar before exiting
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                info!("Stopping screenpipe sidecar before quit...");
                if let Some(sidecar_state) = app_handle_clone.try_state::<SidecarState>() {
                    match crate::sidecar::stop_screenpipe(
                        sidecar_state,
                        app_handle_clone.clone(),
                    )
                    .await
                    {
                        Ok(_) => info!("Screenpipe sidecar stopped successfully"),
                        Err(e) => error!("Failed to stop screenpipe sidecar: {}", e),
                    }
                }
                app_handle_clone.exit(0);
            });
        }
        _ => debug!("Unhandled menu event: {:?}", event.id()),
    }
}

async fn update_menu_if_needed(
    app: &AppHandle,
    update_item: &tauri::menu::MenuItem<Wry>,
) -> Result<()> {
    // Get current state including onboarding status
    let onboarding_completed = OnboardingStore::get(app)
        .ok()
        .flatten()
        .map(|o| o.is_completed)
        .unwrap_or(false);

    // Check license state so menu updates when trial expires or license activates
    let read_only_mode = read_license_fields(app).is_read_only_mode();

    let new_state = MenuState {
        shortcuts: get_current_shortcuts(app)?,
        recording_status: Some(get_recording_status()),
        onboarding_completed,
        read_only_mode,
    };

    // Compare with last state
    let should_update = {
        let mut last_state = LAST_MENU_STATE.lock().unwrap();
        if *last_state != new_state {
            *last_state = new_state.clone();
            true
        } else {
            false
        }
    };

    if should_update {
        if let Some(tray) = app.tray_by_id("thadm_main") {
            let menu = create_dynamic_menu(app, &new_state, update_item)?;
            tray.set_menu(Some(menu))?;
        }
    }

    Ok(())
}

fn get_current_shortcuts(app: &AppHandle) -> Result<HashMap<String, String>> {
    let store = get_store(app, None)?;
    let mut shortcuts = HashMap::new();

    // Get the show shortcut from store
    if let Some(shortcut) = store.get("showScreenpipeShortcut").and_then(|v| v.as_str().map(String::from)) {
        shortcuts.insert("show".to_string(), shortcut);
    }

    Ok(shortcuts)
}

pub fn setup_tray_menu_updater(app: AppHandle, update_item: &tauri::menu::MenuItem<Wry>) {
    let update_item = update_item.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            if let Err(e) = update_menu_if_needed(&app, &update_item).await {
                error!("Failed to update tray menu: {:#}", e);
            }
        }
    });
}

fn format_shortcut(shortcut: &str) -> String {
    // Format shortcut for display in tray menu
    // Handle both "control" and "ctrl" variants since frontend uses "Control"
    let ctrl_symbol = if cfg!(target_os = "macos") {
        "⌃"
    } else {
        "ctrl"
    };

    shortcut
        .to_lowercase()
        .replace(
            "super",
            if cfg!(target_os = "macos") {
                "⌘"
            } else {
                "win"
            },
        )
        .replace("commandorcontrol", ctrl_symbol)
        .replace("control", ctrl_symbol)
        .replace("ctrl", ctrl_symbol)
        .replace(
            "alt",
            if cfg!(target_os = "macos") {
                "⌥"
            } else {
                "alt"
            },
        )
        .replace(
            "shift",
            if cfg!(target_os = "macos") {
                "⇧"
            } else {
                "shift"
            },
        )
        .replace("+", " ")
}
