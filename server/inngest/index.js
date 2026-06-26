// require('dotenv').config();

// const express = require('express');
// const { neon } = require('@neondatabase/serverless');

// const app = express();
// const PORT = process.env.PORT || 4242;

// const sql = neon(process.env.DATABASE_URL);

// app.get('/', async (req, res) => {
//   try {
//     const [result] = await sql`SELECT version()`;
//     const version = result?.version || 'No version found';
//     res.json({ version });
//   } catch (error) {
//     console.error('Database query failed:', error);
//     res.status(500).json({ error: 'Failed to connect to the database.' });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Listening to http://localhost:${PORT}`);
// });
import { Inngest } from 'inngest'
import { prisma } from '../config/prisma.js';

export const inngest = new Inngest({ id: 'Project Management' })

const syncUserCreation = inngest.createFunction(
    { id: 'sync-user-from-clerk', triggers: { event: 'clerk/user.created' } },
    async ({ event }) => {
        const { data } = event;
        await prisma.user.create({
            data: {
                id: data.id,
                email: data.email_addresses[0]?.email_address,
                name: data?.first_name + " " + data?.last_name,
                image: data?.image_url,
            }
        })
    }
)

const syncUserDeletion = inngest.createFunction(
    { id: 'delete-user-from-clerk', triggers: { event: 'clerk/user.deleted' } },
    async ({ event }) => {
        const { data } = event;
        await prisma.user.delete({
            where: {
                id: data.id,
            }
        })
    }
)

const syncUserUpdation = inngest.createFunction(
    { id: 'update-user-from-clerk', triggers: { event: 'clerk/user.updated' } },
    async ({ event }) => {
        const { data } = event;
        await prisma.user.update({
            where: {
                id: data.id,
            },
            data: {
                email: data.email_addresses[0]?.email_address,
                name: data?.first_name + " " + data?.last_name,
                image: data?.image_url,
            }
        })
    }
)

export const functions = [syncUserCreation, syncUserDeletion, syncUserUpdation];