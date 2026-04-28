import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { WeddingProvider } from './context/WeddingContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <WeddingProvider>
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
              fontFamily: 'Outfit, sans-serif',
              padding: '14px 20px',
            },
          }}
        />
      </WeddingProvider>
    </BrowserRouter>
  </React.StrictMode>
)
