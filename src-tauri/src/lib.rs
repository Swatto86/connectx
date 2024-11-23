#[tauri::command]
async fn quit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

use serde::Deserialize;
use windows::Win32::Security::Credentials::{
    CredWriteW, CredReadW, CredDeleteW,
    CREDENTIALW,
    CRED_TYPE_GENERIC,
    CRED_PERSIST_LOCAL_MACHINE,
    CRED_FLAGS
};
use windows::Win32::Foundation::FILETIME;
use windows::core::{PWSTR, PCWSTR};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
};
use std::sync::Mutex;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use std::fs::OpenOptions;
use std::io::Write;

static LAST_HIDDEN_WINDOW: Mutex<String> = Mutex::new(String::new());

#[derive(Deserialize)]
struct Credentials {
    username: String,
    password: String,
}

#[derive(serde::Serialize)]
struct StoredCredentials {
    username: String,
    password: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct Host {
    hostname: String,
    description: String,
}

#[tauri::command]
async fn save_credentials(credentials: Credentials) -> Result<(), String> {
    unsafe {
        // Convert strings to wide character format
        let target_name: Vec<u16> = OsStr::new("ConnectX")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let username: Vec<u16> = OsStr::new(&credentials.username)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let password = credentials.password.as_bytes();

        let cred = CREDENTIALW {
            Flags: CRED_FLAGS(0),
            Type: CRED_TYPE_GENERIC,
            TargetName: PWSTR(target_name.as_ptr() as *mut u16),
            Comment: PWSTR::null(),
            LastWritten: FILETIME::default(),
            CredentialBlobSize: password.len() as u32,
            CredentialBlob: password.as_ptr() as *mut u8,
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: PWSTR::null(),
            UserName: PWSTR(username.as_ptr() as *mut u16),
        };

        CredWriteW(&cred, 0)
            .map_err(|e| format!("Failed to save credentials: {:?}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn search_hosts(query: String) -> Result<Vec<Host>, String> {
    let hosts = get_hosts()?;
    let query = query.to_lowercase();
    
    let filtered_hosts: Vec<Host> = hosts
        .into_iter()
        .filter(|host| {
            host.hostname.to_lowercase().contains(&query) ||
            host.description.to_lowercase().contains(&query)
        })
        .collect();
    
    Ok(filtered_hosts)
}

#[tauri::command]
async fn get_stored_credentials() -> Result<Option<StoredCredentials>, String> {
    unsafe {
        let target_name: Vec<u16> = OsStr::new("ConnectX")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut pcred = std::ptr::null_mut();
        
        match CredReadW(PCWSTR::from_raw(target_name.as_ptr()), CRED_TYPE_GENERIC, 0, &mut pcred) {
            Ok(_) => {
                let cred = &*(pcred as *const CREDENTIALW);
                let username = if !cred.UserName.is_null() {
                    PWSTR::from_raw(cred.UserName.0).to_string()
                        .map_err(|e| format!("Failed to read username: {:?}", e))?
                } else {
                    String::new()
                };
                
                let password = String::from_utf8(
                    std::slice::from_raw_parts(
                        cred.CredentialBlob, 
                        cred.CredentialBlobSize as usize
                    ).to_vec()
                ).map_err(|e| format!("Failed to read password: {:?}", e))?;

                Ok(Some(StoredCredentials { username, password }))
            },
            Err(_) => Ok(None)
        }
    }
}

#[tauri::command]
async fn delete_credentials() -> Result<(), String> {
    unsafe {
        let target_name: Vec<u16> = OsStr::new("ConnectX")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        CredDeleteW(PCWSTR::from_raw(target_name.as_ptr()), CRED_TYPE_GENERIC, 0)
            .map_err(|e| format!("Failed to delete credentials: {:?}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn toggle_visible_window(app_handle: tauri::AppHandle) -> Result<(), tauri::Error> {
    let login_window = app_handle.get_webview_window("login").expect("login window exists");
    let main_window = app_handle.get_webview_window("main").expect("main window exists");

    let login_visible = login_window.is_visible()?;
    let main_visible = main_window.is_visible()?;

    // First, determine which window should be shown
    if login_visible {
        // If login is visible, hide it
        login_window.hide()?;
    } else if main_visible {
        // If main is visible, hide it
        main_window.hide()?;
    } else {
        // If neither is visible, show login window
        // Make sure main window is hidden first
        main_window.hide()?;
        login_window.unminimize()?;  // First unminimize if needed
        login_window.show()?;        // Then show
        login_window.set_focus()?;   // Finally bring to front
    }

    Ok(())
}

#[tauri::command]
async fn close_login_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("login") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn get_login_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("login") {
        window.hide().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Login window not found".to_string())
    }
}

#[tauri::command]
async fn show_login_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(login_window) = app_handle.get_webview_window("login") {
        // First hide main window if it's visible
        if let Some(main_window) = app_handle.get_webview_window("main") {
            main_window.hide().map_err(|e| e.to_string())?;
        }
        
        // Update LAST_HIDDEN_WINDOW to "login"
        if let Ok(mut last_hidden) = LAST_HIDDEN_WINDOW.lock() {
            *last_hidden = "login".to_string();
        }
        
        login_window.unminimize().map_err(|e| e.to_string())?;
        login_window.show().map_err(|e| e.to_string())?;
        login_window.set_focus().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Login window not found".to_string())
    }
}

#[tauri::command]
async fn switch_to_main_window(app_handle: tauri::AppHandle) -> Result<(), tauri::Error> {
    let login_window = app_handle.get_webview_window("login").unwrap();
    let main_window = app_handle.get_webview_window("main").unwrap();

    // First show main window, then hide login window to prevent flicker
    main_window.unminimize()?;
    main_window.show()?;
    main_window.set_focus()?;
    
    // Update LAST_HIDDEN_WINDOW before hiding login window
    if let Ok(mut last_hidden) = LAST_HIDDEN_WINDOW.lock() {
        *last_hidden = "main".to_string();
    }
    
    login_window.hide()?;

    Ok(())
}

#[tauri::command]
async fn hide_main_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
async fn show_hosts_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(hosts_window) = app_handle.get_webview_window("hosts") {
        // First hide main window
        if let Some(main_window) = app_handle.get_webview_window("main") {
            main_window.hide().map_err(|e| e.to_string())?;
        }
        
        // Make sure login window is also hidden
        if let Some(login_window) = app_handle.get_webview_window("login") {
            login_window.hide().map_err(|e| e.to_string())?;
        }
        
        // Now show hosts window
        hosts_window.unminimize().map_err(|e| e.to_string())?;
        hosts_window.show().map_err(|e| e.to_string())?;
        hosts_window.set_focus().map_err(|e| e.to_string())?;
        
        // Update LAST_HIDDEN_WINDOW
        if let Ok(mut last_hidden) = LAST_HIDDEN_WINDOW.lock() {
            *last_hidden = "hosts".to_string();
        }
        
        Ok(())
    } else {
        Err("Hosts window not found".to_string())
    }
}

#[tauri::command]
async fn hide_hosts_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("hosts") {
        window.hide().map_err(|e| e.to_string())?;
        
        // Show main window again and update LAST_HIDDEN_WINDOW
        if let Some(main_window) = app_handle.get_webview_window("main") {
            if let Ok(mut last_hidden) = LAST_HIDDEN_WINDOW.lock() {
                *last_hidden = "main".to_string();
            }
            main_window.show().map_err(|e| e.to_string())?;
            main_window.set_focus().map_err(|e| e.to_string())?;
        }
        Ok(())
    } else {
        Err("Hosts window not found".to_string())
    }
}

#[tauri::command]
fn get_hosts() -> Result<Vec<Host>, String> {
    let path = std::path::Path::new("hosts.csv");
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read CSV: {}", e))?;

    let mut hosts = Vec::new();
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(contents.as_bytes());

    for result in reader.records() {
        match result {
            Ok(record) => {
                if record.len() >= 2 {
                    hosts.push(Host {
                        hostname: record[0].to_string(),
                        description: record[1].to_string(),
                    });
                }
            }
            Err(e) => return Err(format!("Failed to parse CSV record: {}", e)),
        }
    }

    Ok(hosts)
}

#[tauri::command]
fn save_host(host: Host) -> Result<(), String> {
    // Create hosts.csv if it doesn't exist
    if !std::path::Path::new("hosts.csv").exists() {
        let mut wtr = csv::WriterBuilder::new()
            .from_path("hosts.csv")
            .map_err(|e| format!("Failed to create hosts.csv: {}", e))?;
        
        wtr.write_record(&["hostname", "description"])
            .map_err(|e| format!("Failed to write CSV header: {}", e))?;
        
        wtr.flush()
            .map_err(|e| format!("Failed to flush CSV writer: {}", e))?;
    }

    let mut hosts = get_hosts()?;
    
    // Check if hostname is empty or invalid
    if host.hostname.trim().is_empty() {
        return Err("Hostname cannot be empty".to_string());
    }
    
    // Update or add the host
    if let Some(idx) = hosts.iter().position(|h| h.hostname == host.hostname) {
        hosts[idx] = host;
    } else {
        hosts.push(host);
    }

    let mut wtr = csv::WriterBuilder::new()
        .from_path("hosts.csv")
        .map_err(|e| format!("Failed to create CSV writer: {}", e))?;

    // Write header
    wtr.write_record(&["hostname", "description"])
        .map_err(|e| format!("Failed to write CSV header: {}", e))?;

    // Write records
    for host in hosts {
        log_to_file(&format!("Writing host to CSV: {} - {}", host.hostname, host.description));
        wtr.write_record(&[&host.hostname, &host.description])
            .map_err(|e| format!("Failed to write CSV record: {}", e))?;
    }

    wtr.flush()
        .map_err(|e| format!("Failed to flush CSV writer: {}", e))?;

    Ok(())
}

#[tauri::command]
fn delete_host(hostname: String) -> Result<(), String> {
    let hosts: Vec<Host> = get_hosts()?
        .into_iter()
        .filter(|h| h.hostname != hostname)
        .collect();

    let mut wtr = csv::WriterBuilder::new()
        .from_path("hosts.csv")
        .map_err(|e| format!("Failed to create CSV writer: {}", e))?;

    // Write header
    wtr.write_record(&["hostname", "description"])
        .map_err(|e| format!("Failed to write CSV header: {}", e))?;

    // Write records
    for host in hosts {
        wtr.write_record(&[&host.hostname, &host.description])
            .map_err(|e| format!("Failed to write CSV record: {}", e))?;
    }

    wtr.flush()
        .map_err(|e| format!("Failed to flush CSV writer: {}", e))?;

    Ok(())
}



#[tauri::command]
async fn launch_rdp(host: Host) -> Result<(), String> {
    // Get stored credentials
    let credentials = get_stored_credentials().await?
        .ok_or("No stored credentials found".to_string())?;
    
    unsafe {
        // Convert password to wide string (UTF-16) as Windows expects
        let password_wide: Vec<u16> = OsStr::new(&credentials.password)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let target_name: Vec<u16> = OsStr::new(&format!("TERMSRV/{}", host.hostname))
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let username: Vec<u16> = OsStr::new(&credentials.username)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let cred = CREDENTIALW {
            Flags: CRED_FLAGS(0),
            Type: CRED_TYPE_GENERIC,
            TargetName: PWSTR(target_name.as_ptr() as *mut u16),
            Comment: PWSTR::null(),
            LastWritten: FILETIME::default(),
            CredentialBlobSize: (password_wide.len() * 2) as u32,  // Size in bytes (UTF-16 = 2 bytes per char)
            CredentialBlob: password_wide.as_ptr() as *mut u8,     // Use the wide string version
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: PWSTR::null(),
            UserName: PWSTR(username.as_ptr() as *mut u16),
        };

        // For debugging
        println!("Saving credential for target: TERMSRV/{}", host.hostname);
        println!("Username length: {}", credentials.username.len());
        println!("Password length: {}", credentials.password.len());

        match CredWriteW(&cred, 0) {
            Ok(_) => println!("Successfully saved credential"),
            Err(e) => return Err(format!("Failed to save RDP credentials: {:?}", e)),
        }
    }

    // Create filename with hostname and timestamp
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let temp_dir = std::env::temp_dir();
    let rdp_path = temp_dir.join(format!("{}_{}.rdp", host.hostname, timestamp));
    
    // Create RDP file content
    let rdp_content = format!(
        "screen mode id:i:2\r\n\
         desktopwidth:i:1920\r\n\
         desktopheight:i:1080\r\n\
         session bpp:i:32\r\n\
         full address:s:{}\r\n\
         compression:i:1\r\n\
         keyboardhook:i:2\r\n\
         audiocapturemode:i:1\r\n\
         videoplaybackmode:i:1\r\n\
         connection type:i:2\r\n\
         networkautodetect:i:1\r\n\
         bandwidthautodetect:i:1\r\n\
         enableworkspacereconnect:i:1\r\n\
         disable wallpaper:i:0\r\n\
         allow desktop composition:i:0\r\n\
         allow font smoothing:i:0\r\n\
         disable full window drag:i:1\r\n\
         disable menu anims:i:1\r\n\
         disable themes:i:0\r\n\
         disable cursor setting:i:0\r\n\
         bitmapcachepersistenable:i:1\r\n\
         audiomode:i:0\r\n\
         redirectprinters:i:1\r\n\
         redirectcomports:i:0\r\n\
         redirectsmartcards:i:1\r\n\
         redirectclipboard:i:1\r\n\
         redirectposdevices:i:0\r\n\
         autoreconnection enabled:i:1\r\n\
         authentication level:i:2\r\n\
         prompt for credentials:i:0\r\n\
         negotiate security layer:i:1\r\n\
         remoteapplicationmode:i:0\r\n\
         alternate shell:s:\r\n\
         shell working directory:s:\r\n\
         gatewayhostname:s:\r\n\
         gatewayusagemethod:i:4\r\n\
         gatewaycredentialssource:i:4\r\n\
         gatewayprofileusagemethod:i:0\r\n\
         promptcredentialonce:i:1\r\n\
         use redirection server name:i:0\r\n\
         rdgiskdcproxy:i:0\r\n\
         kdcproxyname:s:\r\n\
         username:s:{}\r\n\
         domain:s:\r\n\
         enablecredsspsupport:i:1\r\n\
         public mode:i:0\r\n\
         cert ignore:i:1",
        host.hostname,
        credentials.username
    );

    // Write the RDP file
    std::fs::write(&rdp_path, rdp_content)
        .map_err(|e| format!("Failed to write RDP file: {}", e))?;
    
    // Launch mstsc with the RDP file
    Command::new("mstsc")
        .arg(&rdp_path)
        .spawn()
        .map_err(|e| format!("Failed to launch RDP: {}", e))?;
    
    // Give mstsc time to read the file
    std::thread::sleep(std::time::Duration::from_secs(1));
    
    // Clean up the file
    std::fs::remove_file(&rdp_path)
        .map_err(|e| format!("Failed to clean up RDP file: {}", e))?;
    
    Ok(())
}

fn log_to_file(message: &str) {
    let log_path = "connectx.log";
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
            
        if let Err(e) = writeln!(file, "[{}] {}", timestamp, message) {
            eprintln!("Failed to write to log file: {}", e);
        }
    }
}

#[tauri::command]
async fn scan_domain(app_handle: tauri::AppHandle, _domain: String, server: String) -> Result<String, String> {
    // Get the hosts window and set it to always on top temporarily
    let hosts_window = app_handle.get_webview_window("hosts")
        .ok_or("Failed to get hosts window".to_string())?;
    
    // Set window to always on top
    hosts_window.set_always_on_top(true)
        .map_err(|_| "Failed to set window always on top".to_string())?;

    // Your existing PowerShell command code here
    let ps_command = format!(
        "Import-Module ActiveDirectory; \
         Get-ADComputer -Server '{}' -Filter 'OperatingSystem -like \"*Windows Server*\"' -Properties DNSHostName,Description,OperatingSystem | \
         Where-Object {{$_.DNSHostName}} | \
         Select-Object @{{Name='hostname';Expression={{$_.DNSHostName}}}}, @{{Name='description';Expression={{$_.Description}}}} | \
         Export-Csv -Path 'hosts.csv' -NoTypeInformation -Force",
        server
    );

    let result = Command::new("powershell")
        .args([
            "-WindowStyle", 
            "Hidden", 
            "-NoProfile", 
            "-NonInteractive", 
            "-Command", 
            &ps_command
        ])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell command: {}", e));

    // Reset always on top after command completes
    let _ = hosts_window.set_always_on_top(false);

    // Return the result
    match result {
        Ok(output) => {
            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Failed to scan domain. Error: {}", error));
            }

            let found_servers = match std::fs::read_to_string("hosts.csv") {
                Ok(contents) => contents.lines().count().saturating_sub(1),
                Err(_) => 0
            };

            if found_servers == 0 {
                Err("No Windows Servers found in the domain.".to_string())
            } else {
                Ok(format!("Successfully found {} Windows Server(s).", found_servers))
            }
        },
        Err(e) => Err(e)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize the LAST_HIDDEN_WINDOW
            if let Ok(mut last_hidden) = LAST_HIDDEN_WINDOW.lock() {
                *last_hidden = "login".to_string();
            }
            
            // Create menu items
            let show_item = MenuItem::with_id(app.app_handle(), "show", "Show Window", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app.app_handle(), "hide", "Hide Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app.app_handle(), "quit", "Quit", true, None::<&str>)?;

            // Create the menu with Quit at the bottom
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            // Set up close handlers for both windows
            let login_window = app.get_webview_window("login").unwrap();
            let main_window = app.get_webview_window("main").unwrap();
            let hosts_window = app.get_webview_window("hosts").unwrap();
            
            let app_handle = app.app_handle().clone();
            login_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    app_handle.exit(0);
                }
            });

            let app_handle = app.app_handle().clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    app_handle.exit(0);
                }
            });

            let app_handle = app.app_handle().clone();
            hosts_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    app_handle.exit(0);
                }
            });

            // Create the system tray
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .menu_on_left_click(true)
                .on_tray_icon_event(|tray_handle, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app_handle = tray_handle.app_handle().clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = toggle_visible_window(app_handle).await {
                                eprintln!("Failed to toggle window visibility: {}", e);
                            }
                        });
                    }
                    TrayIconEvent::Click {
                        button: MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        // Handle right click if needed
                    }
                    _ => () // Silently ignore all other events
                })
                .on_menu_event(|app, event| match event.id() {
                    id if id == "quit" => {
                        app.exit(0);
                    }
                    id if id == "show" => {
                        if let Ok(window_label) = LAST_HIDDEN_WINDOW.lock() {
                            if let Some(window) = app.get_webview_window(&window_label) {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    id if id == "hide" => {
                        // Check which window is visible and store its label
                        let login_window = app.get_webview_window("login");
                        let main_window = app.get_webview_window("main");
                        let hosts_window = app.get_webview_window("hosts");
                        
                        if let Some(window) = login_window {
                            if window.is_visible().unwrap_or(false) {
                                if let Ok(mut last_hidden) = LAST_HIDDEN_WINDOW.lock() {
                                    *last_hidden = "login".to_string();
                                }
                                let _ = window.hide();
                            }
                        }
                        if let Some(window) = main_window {
                            if window.is_visible().unwrap_or(false) {
                                if let Ok(mut last_hidden) = LAST_HIDDEN_WINDOW.lock() {
                                    *last_hidden = "main".to_string();
                                }
                                let _ = window.hide();
                            }
                        }
                        if let Some(window) = hosts_window {
                            if window.is_visible().unwrap_or(false) {
                                if let Ok(mut last_hidden) = LAST_HIDDEN_WINDOW.lock() {
                                    *last_hidden = "hosts".to_string();
                                }
                                let _ = window.hide();
                            }
                        }
                    }
                    _ => {}
                })
                .build(app)
                .expect("Failed to build tray icon");

            let window = app.get_webview_window("login").unwrap();
            let main_window = app.get_webview_window("main").unwrap();
            let hosts_window = app.get_webview_window("hosts").unwrap();
            
            let window_clone = window.clone();
            let main_window_clone = main_window.clone();
            let hosts_window_clone = hosts_window.clone();
            
            tauri::async_runtime::spawn(async move {
                std::thread::sleep(std::time::Duration::from_millis(100));
                // Center login window
                window_clone.center().unwrap();
                window_clone.show().unwrap();
                window_clone.set_focus().unwrap();
                
                // Center main window
                main_window_clone.center().unwrap();
                
                // Center hosts window
                hosts_window_clone.center().unwrap();
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ 
            quit_app, 
            save_credentials,
            get_stored_credentials,
            delete_credentials,
            toggle_visible_window,
            close_login_window,
            get_login_window,
            show_login_window,
            switch_to_main_window,
            hide_main_window,
            show_hosts_window,
            get_hosts,
            save_host,
            delete_host,
            hide_hosts_window,
            search_hosts,
            launch_rdp,
            scan_domain,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}