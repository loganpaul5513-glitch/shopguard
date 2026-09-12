import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { handleAdminRequest } from './server/adminHandler.js'
import { handleInboundEmailRequest } from './server/inboundEmailHandler.js'

function adminStaticRoutePlugin() {
  return {
    name: 'admin-static-route',
    writeBundle(options) {
      const distDir = options.dir || path.resolve('dist')
      const indexPath = path.join(distDir, 'index.html')
      if (!fs.existsSync(indexPath)) return
      const adminDir = path.join(distDir, 'admin')
      fs.mkdirSync(adminDir, { recursive: true })
      fs.copyFileSync(indexPath, path.join(adminDir, 'index.html'))
    },
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

async function handleSendEmail(req, res, env) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ message: 'Method not allowed' }))
    return
  }

  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ message: 'Resend API key is not configured.' }))
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ message: 'Invalid JSON body' }))
    return
  }

  const { to, subject, html, attachments, from } = body
  if (!to?.trim()) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ message: 'Recipient email is required.' }))
    return
  }

  const fromEmail =
    from?.trim() ||
    env.VITE_RESEND_FROM_EMAIL ||
    'ShopGuard <onboarding@resend.dev>'

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to.trim()],
        subject,
        html,
        attachments,
      }),
    })

    const responseBody = await response.json().catch(() => ({}))
    res.statusCode = response.status
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify(
        response.ok
          ? responseBody
          : { message: responseBody.message || `Failed to send email (${response.status})` },
      ),
    )
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ message: err.message || 'Failed to send email' }))
  }
}

function apiDevPlugin(env) {
  const attach = (server) => {
    const wrap = (handler) => (req, res) => {
      Promise.resolve(handler(req, res, env)).catch((err) => {
        if (res.headersSent) return
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ message: err.message || 'Request failed.' }))
      })
    }
    server.middlewares.use('/api/sendEmail', wrap(handleSendEmail))
    server.middlewares.use('/api/admin', wrap(handleAdminRequest))
    server.middlewares.use('/api/inboundEmail', wrap(handleInboundEmailRequest))
  }

  return {
    name: 'shopguard-api-dev',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    appType: 'spa',
    plugins: [react(), apiDevPlugin(env), adminStaticRoutePlugin()],
  }
})
