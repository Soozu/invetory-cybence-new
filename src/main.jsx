import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { InventoryProvider } from './context/InventoryContext.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <InventoryProvider><App /></InventoryProvider>
    </BrowserRouter>
  </React.StrictMode>
)
