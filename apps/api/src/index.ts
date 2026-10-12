import 'dotenv/config'
import cors from 'cors'
import express from 'express'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_request, response) => {
  response.json({ status: 'ok', service: 'api' })
})

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
