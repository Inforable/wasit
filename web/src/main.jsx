import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { applyTheme } from './lib/theme.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/welcome.css';
import './styles/onboarding.css';
import './styles/shell.css';
import './styles/journey.css';
import './styles/deck.css';
import './styles/commerce.css';
import './styles/agentic.css';
import './styles/roles.css';
import './styles/extras.css';
import './styles/foundation.css';

applyTheme();
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
