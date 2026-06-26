use tauri::Manager;

// DEV: sobe o motor a partir do venv local (sem empacotar).
#[cfg(debug_assertions)]
fn start_motor(_app: &tauri::AppHandle) {
    use std::process::Command;

    let manifest = env!("CARGO_MANIFEST_DIR");
    let motor_dir = format!("{manifest}/../../motor");
    let python = format!("{motor_dir}/.venv/Scripts/python.exe");

    match Command::new(&python)
        .args([
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8077",
        ])
        .current_dir(&motor_dir)
        .spawn()
    {
        Ok(_) => log::info!("Motor Python (dev) iniciado em 127.0.0.1:8077"),
        Err(error) => log::warn!("Nao foi possivel iniciar o motor (dev): {error}"),
    }
}

// PRODUÇÃO: roda o sidecar empacotado (motor.exe) e aponta os dados para uma
// pasta gravável do usuário (%APPDATA%) via DARK_HUB_DATA.
#[cfg(not(debug_assertions))]
fn start_motor(app: &tauri::AppHandle) {
    use tauri_plugin_shell::ShellExt;

    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let _ = std::fs::create_dir_all(&data_dir);

    match app.shell().sidecar("motor") {
        Ok(command) => {
            let command = command.env("DARK_HUB_DATA", data_dir.to_string_lossy().to_string());
            if let Err(error) = command.spawn() {
                log::warn!("Nao foi possivel iniciar o sidecar motor: {error}");
            }
        }
        Err(error) => log::warn!("Sidecar motor indisponivel: {error}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            start_motor(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
