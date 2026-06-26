// DEV: sobe o motor a partir do venv local (processo separado; encerrado pelos
// scripts de dev). PRODUÇÃO: roda o sidecar empacotado e o ENCERRA ao sair do
// app — assim o motor.exe não fica travado quando o updater for substituí-lo.

#[cfg(debug_assertions)]
fn start_motor_dev() {
    use std::process::Command;

    let manifest = env!("CARGO_MANIFEST_DIR");
    let motor_dir = format!("{manifest}/../../motor");
    let python = format!("{motor_dir}/.venv/Scripts/python.exe");

    match Command::new(&python)
        .args([
            "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8077",
        ])
        .current_dir(&motor_dir)
        .spawn()
    {
        Ok(_) => log::info!("Motor Python (dev) iniciado em 127.0.0.1:8077"),
        Err(error) => log::warn!("Nao foi possivel iniciar o motor (dev): {error}"),
    }
}

#[cfg(debug_assertions)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;
            start_motor_dev();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(debug_assertions))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::sync::{Arc, Mutex};
    use tauri::{Manager, RunEvent};
    use tauri_plugin_shell::process::CommandChild;
    use tauri_plugin_shell::ShellExt;

    let motor: Arc<Mutex<Option<CommandChild>>> = Arc::new(Mutex::new(None));
    let motor_setup = motor.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let _ = std::fs::create_dir_all(&data_dir);
            if let Ok(command) = app.shell().sidecar("motor") {
                let command =
                    command.env("DARK_HUB_DATA", data_dir.to_string_lossy().to_string());
                match command.spawn() {
                    Ok((_rx, child)) => {
                        *motor_setup.lock().unwrap() = Some(child);
                    }
                    Err(error) => log::warn!("Nao foi possivel iniciar o sidecar motor: {error}"),
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = motor.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
