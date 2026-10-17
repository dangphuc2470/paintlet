use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::{Emitter, Manager, RunEvent};

mod save_panel;

// Documents macOS asks us to open (Finder double-click, Open With), arriving
// as RunEvent::Opened. The event can fire before the webview has loaded enough
// to listen for Tauri events — that is every cold-start launch-by-double-click
// — so requests that early are buffered here and replayed when the frontend
// calls webview_ready. Once the frontend is listening, requests go straight
// through. The buffering means an open is never delivered twice: each request
// is either buffered-and-replayed or emitted directly, never both.
struct OpenQueue {
    frontend_ready: bool,
    pending: Vec<String>,
}

impl OpenQueue {
    fn new() -> Self {
        Self {
            frontend_ready: false,
            pending: Vec::new(),
        }
    }

    // What to do with a fresh open request: Some(paths) means "emit now",
    // None means "buffered for the ready handshake".
    fn enqueue(&mut self, paths: Vec<String>) -> Option<Vec<String>> {
        if self.frontend_ready {
            Some(paths)
        } else {
            self.pending.extend(paths);
            None
        }
    }

    // Mark the frontend as listening and return anything buffered so far.
    fn mark_frontend_ready(&mut self) -> Option<Vec<String>> {
        self.frontend_ready = true;
        (!self.pending.is_empty()).then(|| std::mem::take(&mut self.pending))
    }
}

// The frontend's readiness handshake, called right after it installs its
// document-open listener — see App.tsx. Emits any opens that arrived during
// webview load, so a file double-clicked before the UI existed still opens.
#[tauri::command]
fn webview_ready(app: tauri::AppHandle, queue: tauri::State<Mutex<OpenQueue>>) {
    let flush = queue.lock().unwrap().mark_frontend_ready();
    if let Some(paths) = flush {
        let _ = app.emit("document-open", paths);
    }
}

// Open (or re-focus) the About window.
//
// About is the one dialog that's a real OS window rather than an in-app panel:
// it's the macOS convention for an About box, and it's the only one where that's
// cheap, since it reads nothing from the editor's canvas state. Created here in
// Rust rather than from JS so the window is built on demand — declaring it in
// tauri.conf.json would spin up its webview at launch and pay the memory for a
// window most sessions never open.
#[tauri::command]
fn open_about_window(app: tauri::AppHandle) -> Result<(), String> {
    // Already open: bring it forward instead of stacking a second copy.
    if let Some(win) = app.get_webview_window("about") {
        let _ = win.unminimize();
        let _ = win.show();
        return win.set_focus().map_err(|e| e.to_string());
    }

    tauri::WebviewWindowBuilder::new(&app, "about", tauri::WebviewUrl::App("about.html".into()))
        .title("About Paint")
        .inner_size(340.0, 300.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    hide_minimize_and_zoom(&app, "about");

    Ok(())
}

// A macOS About box shows only a close button. Building the window
// non-minimizable / non-maximizable merely greys those two out, which reads as
// "temporarily unavailable" rather than "not applicable" — so remove them.
// AppKit may only be touched on the main thread.
#[cfg(target_os = "macos")]
fn hide_minimize_and_zoom(app: &tauri::AppHandle, label: &'static str) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        use objc2_app_kit::{NSWindow, NSWindowButton};

        let Some(win) = app.get_webview_window(label) else {
            return;
        };
        let Ok(ptr) = win.ns_window() else { return };
        // SAFETY: ns_window() hands back the NSWindow backing this Tauri
        // window, and we're inside run_on_main_thread — the only place AppKit
        // views may be touched.
        let ns_window: &NSWindow = unsafe { &*ptr.cast::<NSWindow>() };
        for button in [
            NSWindowButton::MiniaturizeButton,
            NSWindowButton::ZoomButton,
        ] {
            if let Some(b) = ns_window.standardWindowButton(button) {
                b.setHidden(true);
            }
        }
    });
}

// Read a file off disk and hand the raw bytes back to the webview as an
// ArrayBuffer. We go through a Rust command (rather than the fs plugin) so the
// user can open/save anywhere they pick in the native dialog without wrestling
// with fs-scope globs — std::fs has no path allowlist.
#[tauri::command]
fn read_image_file(path: String) -> Result<Response, String> {
    std::fs::read(&path)
        .map(Response::new)
        .map_err(|e| e.to_string())
}

// Write raw bytes (a PNG/JPEG the frontend encoded from the canvas) to disk.
#[tauri::command]
fn write_image_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| e.to_string())
}

// Show the save panel that has a real format popup — see save_panel.rs for why
// this can't come from the dialog plugin.
//
// AppKit panels are main-thread-only and runModal spins its own event loop, so
// the work is hopped to the main thread and this command blocks on a channel
// until it closes. Blocking is safe precisely because this is a *synchronous*
// command: Tauri runs those on a worker thread, never on the main thread or the
// async runtime, so nothing the panel needs is held up waiting on us.
#[tauri::command]
fn save_image_dialog(
    app: tauri::AppHandle,
    request: save_panel::SaveRequest,
) -> Result<save_panel::SaveResponse, String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            // On the main thread by construction, so this marker is sound.
            let mtm =
                objc2::MainThreadMarker::new().expect("run_on_main_thread ran off the main thread");
            let _ = tx.send(save_panel::run(mtm, &request));
        })
        .map_err(|e| e.to_string())?;

        rx.recv()
            .map_err(|_| "the save panel closed unexpectedly".to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        // No AppKit, so no native format popup; the frontend falls back to the
        // plugin dialog. Paintlet only ships for macOS, but the shell still has
        // to compile elsewhere.
        let _ = (app, request);
        Ok(save_panel::SaveResponse::unsupported())
    }
}

// Native macOS alert prompt for unsaved changes using real NSAlert (100% native UI,
// real system font, real system accent colors, real system button style).
#[tauri::command]
fn prompt_save_dialog(
    app: tauri::AppHandle,
    document_name: String,
) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            use objc2_app_kit::{NSAlert, NSAlertStyle};
            use objc2_foundation::NSString;

            let mtm = objc2::MainThreadMarker::new().expect("run_on_main_thread ran off the main thread");
            let alert = NSAlert::new(mtm);
            alert.setMessageText(&NSString::from_str(&format!(
                "Do you want to save the changes made to the document \u{201C}{}\u{201D}?",
                document_name
            )));
            alert.setInformativeText(&NSString::from_str(
                "Your changes will be lost if you don\u{2019}t save them.",
            ));
            alert.setAlertStyle(NSAlertStyle::Warning);
            // Button 1: Save (first button = 1000)
            alert.addButtonWithTitle(&NSString::from_str("Save"));
            // Button 2: Cancel (second button = 1001)
            alert.addButtonWithTitle(&NSString::from_str("Cancel"));
            // Button 3: Don't Save (third button = 1002)
            alert.addButtonWithTitle(&NSString::from_str("Don\u{2019}t Save"));

            let response = alert.runModal();
            let res_str = match response {
                1000 => "save",
                1001 => "cancel",
                1002 => "dont_save",
                _ => "cancel",
            };
            let _ = tx.send(res_str.to_string());
        })
        .map_err(|e| e.to_string())?;

        rx.recv()
            .map_err(|_| "the alert closed unexpectedly".to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, document_name);
        Ok("cancel".to_string())
    }
}

// macOS auto-appends items to any menu titled "Edit": "Start Dictation…",
// "Emoji & Symbols", and (macOS 15.1+) "Writing Tools" / "AutoFill". The first
// two honor AppKit's NSUserDefaults switches — set them before the menu is
// built. (These are user-defaults keys, NOT Info.plist keys: putting them in
// Info.plist does nothing, which is why the earlier Info.plist approach still
// showed Dictation.) Writing Tools / AutoFill have no such switch and are
// stripped from the installed menu instead — see strip_edit_menu_system_items.
#[cfg(target_os = "macos")]
fn disable_edit_menu_auto_items() {
    use objc2_foundation::{ns_string, NSUserDefaults};
    let defaults = NSUserDefaults::standardUserDefaults();
    defaults.setBool_forKey(true, ns_string!("NSDisabledDictationMenuItem"));
    defaults.setBool_forKey(true, ns_string!("NSDisabledCharacterPaletteMenuItem"));
}

// Remove the system-injected Edit-menu items that have no defaults switch
// (Writing Tools, AutoFill). The JS side invokes this right after it installs
// the menu bar; AppKit must only be touched from the main thread.
#[tauri::command]
fn strip_edit_menu_system_items(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(|| {
            use objc2::MainThreadMarker;
            use objc2_app_kit::NSApplication;

            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };
            let nsapp = NSApplication::sharedApplication(mtm);
            let Some(main_menu) = nsapp.mainMenu() else {
                return;
            };
            for i in 0..main_menu.numberOfItems() {
                let Some(item) = main_menu.itemAtIndex(i) else {
                    continue;
                };
                let Some(submenu) = item.submenu() else {
                    continue;
                };
                if submenu.title().to_string() != "Edit" {
                    continue;
                }
                // Walk backwards so removals don't shift indices still to
                // be visited. Match by title: the injected items live on
                // private selectors, so the visible title is the stable
                // hook. (Dictation/Emoji are already suppressed via the
                // defaults keys; matching them here is just a backstop.)
                for j in (0..submenu.numberOfItems()).rev() {
                    let Some(sub) = submenu.itemAtIndex(j) else {
                        continue;
                    };
                    let title = sub.title().to_string();
                    if title.contains("Writing Tools")
                        || title.contains("AutoFill")
                        || title.contains("Start Dictation")
                        || title.contains("Emoji")
                    {
                        submenu.removeItem(&sub);
                    }
                }
                // Drop any separator the removals left dangling at the end.
                while submenu.numberOfItems() > 0 {
                    let last = submenu.itemAtIndex(submenu.numberOfItems() - 1);
                    match last {
                        Some(l) if l.isSeparatorItem() => submenu.removeItem(&l),
                        _ => break,
                    }
                }
                break;
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

static PENDING_OPEN_FILES: std::sync::Mutex<Option<Vec<String>>> = std::sync::Mutex::new(None);
static PENDING_WINDOW_FILES: std::sync::Mutex<Option<std::collections::HashMap<String, String>>> =
    std::sync::Mutex::new(None);

#[tauri::command]
fn get_window_file(window: tauri::WebviewWindow) -> Option<String> {
    let label = window.label();
    if let Ok(mut map_lock) = PENDING_WINDOW_FILES.lock() {
        if let Some(ref mut map) = *map_lock {
            if let Some(path) = map.remove(label) {
                return Some(path);
            }
        }
    }
    // Check initial CLI args if it's the main window
    if label == "main" {
        if let Ok(mut pending_lock) = PENDING_OPEN_FILES.lock() {
            if let Some(ref mut pending) = *pending_lock {
                if let Some(file) = pending.pop() {
                    return Some(file);
                }
            }
        }
        let args: Vec<String> = std::env::args().collect();
        if args.len() > 1 {
            for arg in &args[1..] {
                if !arg.starts_with('-') && std::path::Path::new(arg).exists() {
                    return Some(arg.clone());
                }
            }
        }
    }
    None
}

#[tauri::command]
fn open_new_window(app: tauri::AppHandle, file_path: Option<String>) -> Result<(), String> {
    let win_id = format!(
        "paint-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );
    if let Some(ref path) = file_path {
        if let Ok(mut map_lock) = PENDING_WINDOW_FILES.lock() {
            if map_lock.is_none() {
                *map_lock = Some(std::collections::HashMap::new());
            }
            if let Some(ref mut map) = *map_lock {
                map.insert(win_id.clone(), path.clone());
            }
        }
    }

    let mut builder =
        tauri::WebviewWindowBuilder::new(&app, &win_id, tauri::WebviewUrl::App("index.html".into()))
            .title("Paint")
            .inner_size(1100.0, 780.0)
            .min_inner_size(900.0, 600.0)
            .center();

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

fn is_editor_window(label: &str) -> bool {
    label == "main" || label.starts_with("paint-")
}

// The editor the user is actually typing in. Menu accelerators are app-global,
// and Tauri's is_focused() can be true for the wrong window while the menu
// handles the key, so on macOS match AppKit's key window instead.
fn focused_editor(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    #[cfg(target_os = "macos")]
    {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSApplication;

        if let Some(mtm) = MainThreadMarker::new() {
            if let Some(key) = NSApplication::sharedApplication(mtm).keyWindow() {
                let key_ptr = objc2::rc::Retained::as_ptr(&key) as isize;
                if let Some(win) = app.webview_windows().into_values().find(|win| {
                    is_editor_window(win.label())
                        && win
                            .ns_window()
                            .map(|ptr| ptr as isize == key_ptr)
                            .unwrap_or(false)
                }) {
                    return Some(win);
                }
            }
        }
    }

    app.webview_windows().into_values().find(|win| {
        is_editor_window(win.label()) && win.is_focused().unwrap_or(false)
    })
}

// The menu bar is one per app on macOS. Building it in Rust (not in each
// webview) keeps the item callbacks alive after the first window closes, and
// the click is forwarded only to the editor that currently has focus.
fn build_app_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};

    let item = |id, text, accel: Option<&str>| MenuItem::with_id(app, id, text, true, accel);

    let about = item("about", "About Paint", None)?;
    // No key equivalents. On macOS an accelerator is app-global and steals the
    // key before the focused webview sees it, so the shortcut runs in the wrong
    // window (or in none). Each editor handles ⌘-keys itself.
    let settings = item("settings", "Settings…", None)?;
    let quit = item("quit", "Quit Paint", None)?;
    let services = PredefinedMenuItem::services(app, None)?;

    let new_doc = item("new", "New", None)?;
    let open = item("open", "Open…", None)?;
    let save = item("save", "Save", None)?;
    let save_as = item("save-as", "Save As…", None)?;
    let close = item("close", "Close Window", None)?;

    let undo = item("undo", "Undo", None)?;
    let redo = item("redo", "Redo", None)?;
    let cut = item("cut", "Cut", None)?;
    let copy = item("copy", "Copy", None)?;
    let paste = item("paste", "Paste", None)?;
    let delete = item("delete", "Delete", None)?;
    let select_all = item("select-all", "Select All", None)?;
    let resize = item("resize", "Resize…", None)?;
    let crop = item("crop", "Crop to Selection", None)?;
    let flip_h = item("flip-h", "Flip Horizontal", None)?;
    let flip_v = item("flip-v", "Flip Vertical", None)?;
    let rot_r = item("rotate-right", "Rotate 90° Right", None)?;
    let rot_l = item("rotate-left", "Rotate 90° Left", None)?;
    let rot_180 = item("rotate-180", "Rotate 180°", None)?;

    let zoom_in = item("zoom-in", "Zoom In", None)?;
    let zoom_out = item("zoom-out", "Zoom Out", None)?;
    let actual = item("actual-size", "Actual Size", None)?;
    let fit = item("fit", "Fit to Window", None)?;

    let app_menu = SubmenuBuilder::new(app, "Paint")
        .item(&about)
        .separator()
        .item(&settings)
        .separator()
        .item(&services)
        .separator()
        .item(&quit)
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_doc)
        .item(&open)
        .separator()
        .item(&save)
        .item(&save_as)
        .separator()
        .item(&close)
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&delete)
        .separator()
        .item(&select_all)
        .separator()
        .item(&resize)
        .item(&crop)
        .separator()
        .item(&flip_h)
        .item(&flip_v)
        .item(&rot_r)
        .item(&rot_l)
        .item(&rot_180)
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&actual)
        .item(&fit)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    disable_edit_menu_auto_items();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Mutex::new(OpenQueue::new()))
        .invoke_handler(tauri::generate_handler![
            read_image_file,
            write_image_file,
            save_image_dialog,
            prompt_save_dialog,
            strip_edit_menu_system_items,
            open_about_window,
            webview_ready,
            get_window_file,
            open_new_window
        ])
        .setup(|app| {
            let menu = build_app_menu(app.handle())?;
            app.set_menu(menu)?;
            strip_edit_menu_system_items(app.handle().clone());
            Ok(())
        })
        .on_menu_event(|app, event| {
            let Some(win) = focused_editor(app) else {
                return;
            };
            // Window::emit fans out to every target. The listener is registered
            // for this window only, so the event has to be addressed to it or
            // every open document runs the same command.
            let _ = win.emit_to(
                tauri::EventTarget::window(win.label()),
                "menu-action",
                event.id.0.clone(),
            );
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                use tauri::Manager;
                let app = window.app_handle();
                let doc_windows: Vec<_> = app
                    .webview_windows()
                    .into_iter()
                    .filter(|(label, _)| label != "about")
                    .collect();
                if doc_windows.is_empty() {
                    app.exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Ok(file_path) = url.to_file_path() {
                    if let Some(path_str) = file_path.to_str() {
                        let path_string = path_str.to_string();

                        use tauri::Manager;
                        let doc_windows: Vec<_> = app_handle
                            .webview_windows()
                            .into_iter()
                            .filter(|(label, _)| label != "about")
                            .collect();

                        if doc_windows.is_empty() {
                            if let Ok(mut pending_lock) = PENDING_OPEN_FILES.lock() {
                                if pending_lock.is_none() {
                                    *pending_lock = Some(Vec::new());
                                }
                                if let Some(ref mut pending) = *pending_lock {
                                    pending.push(path_string.clone());
                                }
                            }
                        } else {
                            let _ = open_new_window(app_handle.clone(), Some(path_string.clone()));
                        }
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::OpenQueue;

    #[test]
    fn open_before_the_frontend_is_ready_is_buffered_then_replayed_once() {
        let mut queue = OpenQueue::new();
        assert_eq!(queue.enqueue(vec!["a".into()]), None);
        assert_eq!(queue.enqueue(vec!["b".into(), "c".into()]), None);
        assert_eq!(
            queue.mark_frontend_ready(),
            Some(vec!["a".into(), "b".into(), "c".into()])
        );
        // The replay is one-shot: a second handshake has nothing to flush.
        assert_eq!(queue.mark_frontend_ready(), None);
    }

    #[test]
    fn open_after_the_frontend_is_ready_is_delivered_directly() {
        let mut queue = OpenQueue::new();
        queue.mark_frontend_ready();
        assert_eq!(queue.enqueue(vec!["a".into()]), Some(vec!["a".into()]));
        // And nothing lingers in the buffer for a later replay.
        assert_eq!(queue.mark_frontend_ready(), None);
    }
}
