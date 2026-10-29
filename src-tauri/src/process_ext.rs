/// Evita que en Windows se abra una ventana de consola por cada proceso
/// lanzado (Java, instaladores, PowerShell...). En el resto de sistemas no hace nada.
pub trait NoConsoleWindow {
    fn no_console_window(&mut self) -> &mut Self;
}

impl NoConsoleWindow for tokio::process::Command {
    fn no_console_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}
