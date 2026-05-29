import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { WeddingProvider } from './context/WeddingProvider'
import { LanguageProvider } from './context/LanguageProvider'
import { AICoachProvider } from './context/AICoachProvider'
import App from './App'
import './index.css'

// Initialize theme immediately to prevent FOUC and missing theme on direct loads
try {
  const initialTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', initialTheme);
} catch {
  document.documentElement.setAttribute('data-theme', 'dark');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider>
        <WeddingProvider>
          <AICoachProvider>
            <App />
            <Toaster
              position="top-center"
              toastOptions={{
                duration: 3000,
                className: 'toast-custom',
                style: {
                  background: 'rgba(30, 20, 50, 0.95)',
                  color: '#F8FAFC',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  backdropFilter: 'blur(20px)',
                  fontFamily: 'Inter, "Noto Sans Devanagari", sans-serif',
                  padding: '14px 20px',
                },
              }}
            />
          </AICoachProvider>
        </WeddingProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
)
