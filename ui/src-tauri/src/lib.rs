// Em desenvolvimento, sobe o motor Python (FastAPI) a partir do venv local.
// Em produção, o motor virá empacotado como "sidecar" (PyInstaller) — TODO.
#[cfg(debug_assertions)]
fn start_motor() {
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
        Ok(_) => log::info!("Motor Python iniciado em 127.0.0.1:8077"),
        Err(error) => log::warn!("Nao foi possivel iniciar o motor Python: {error}"),
    }
}

#[cfg(not(debug_assertions))]
fn start_motor() {
    // Produção: iniciar o sidecar empacotado. Implementado na etapa de build.
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            start_motor();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
