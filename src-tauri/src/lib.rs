// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

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
use tauri::Manager;
use std::time::Duration;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            quit_app, 
            save_credentials,
            get_stored_credentials,
            delete_credentials
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let window_clone = window.clone();
            
            tauri::async_runtime::spawn(async move {
                std::thread::sleep(Duration::from_millis(100));
                window_clone.center().unwrap();
                window_clone.show().unwrap();
                window_clone.set_focus().unwrap();
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
