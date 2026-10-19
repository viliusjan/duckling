import { render } from 'preact';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import { App } from './App';
import { themeHint } from './theme';
import './style.css';

// Apply the last theme before first paint to avoid a flash of the wrong colours.
const hint = themeHint();
if (hint !== 'system') document.documentElement.dataset.theme = hint;

render(<App />, document.getElementById('app')!);
