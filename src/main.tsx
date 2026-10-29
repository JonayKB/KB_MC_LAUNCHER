import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppLoader from "./AppLoader";
import LogWindow from "./screens/LogWindow";
import { ThemeProvider } from "./context/ThemeContext";
import './styles/theme.css';

// La ventana de logs del juego carga el mismo index.html: se distingue por su etiqueta
const isLogWindow = getCurrentWindow().label.startsWith('logs-');

ReactDOM.createRoot(document.getElementById('root')!).render(
  isLogWindow
    ? <ThemeProvider><LogWindow /></ThemeProvider>
    : <AppLoader />
);
