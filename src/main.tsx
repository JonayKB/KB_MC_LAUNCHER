import ReactDOM from "react-dom/client";
import AppLoader from "./AppLoader";
import './styles/theme.css';

import { ThemeProvider } from './context/ThemeContext';
import { UserProvider } from './context/UserContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <UserProvider>
      <AppLoader />
    </UserProvider>
  </ThemeProvider>
);