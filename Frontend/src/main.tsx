import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { WeddingProvider } from '@/context/WeddingProvider'
import { LanguageProvider } from '@/context/LanguageProvider'
import { AICoachProvider } from '@/features/coach/AICoachProvider'
import App from '@/app/App'
import '@/styles/index.css'
import { initSentry } from '@/app/sentry'

// Error monitoring — no-op unless VITE_SENTRY_DSN is set (§14.G).
initSentry()

// Initialize theme immediately to prevent FOUC and missing theme on direct loads
try {
  const initialTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', initialTheme);
} catch {
  document.documentElement.setAttribute('data-theme', 'dark');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
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
                  background: 'rgba(34, 35, 40, 0.96)', // logo charcoal
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
