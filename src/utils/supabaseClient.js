import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://djjvvviujrobfcndrkvp.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqanZ2dml1anJvYmZjbmRya3dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5OTEzNzAsImV4cCI6MjA3MTU2NzM3MH0.q818_iPIOy-LcmdXH4JPS6We0ejC802ORl_2yR_ENHQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Configuração da API
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

// Em desenvolvimento, use o servidor local
// Em produção, use uma URL vazia pois o proxy já mapeia /api/*
export const API_BASE_URL = isDevelopment 
  ? 'http://213.199.50.212:4000'
  : ''

// Helper para fazer requisições autenticadas
export const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token')
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Erro na requisição')
  }
  
  return response.json()
}

// Helper para upload de arquivos
export const uploadFile = async (endpoint, file, additionalData = {}) => {
  const token = localStorage.getItem('token')
  
  const formData = new FormData()
  formData.append('file', file)
  
  Object.keys(additionalData).forEach(key => {
    formData.append(key, additionalData[key])
  })

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Erro no upload')
  }

  return response.json()
}
