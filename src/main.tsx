import { createRoot } from 'react-dom/client';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './ui/styles.css';
import { App } from './ui/App';
import { startLoop } from './ui/loop';

startLoop();
createRoot(document.getElementById('root')!).render(<App />);
