import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import { clerkMiddleware } from '@clerk/express'
import { serve } from 'inngest/express'
import { inngest, functions } from './inngest/index.js'
const app = express()

app.use(express.json());
app.use(cors());


app.use('/api/inngest', serve({ client: inngest, functions }))

app.use(clerkMiddleware())

app.get('/', (req, res) => res.send("Server is live"));

const PORT = process.env.port || 5000;

app.listen(PORT, () => console.log(`server is running on http://localhost:${PORT}`)
)