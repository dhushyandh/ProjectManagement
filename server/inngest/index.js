import 'dotenv/config'
import SendEmail from '../config/nodemailer.js';

if (!process.env.INNGEST_SIGNING_KEY && process.env.INNGEST_SECRET_KEY) {
    process.env.INNGEST_SIGNING_KEY = process.env.INNGEST_SECRET_KEY;
}
import { Inngest, step } from 'inngest'
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

// Inngest function to save workspace data to the database
const syncWorkspaceCreation = inngest.createFunction(
    { id: 'sync-workspace-from-clerk', triggers: { event: 'clerk/organization.created' } },
    async ({ event }) => {
        const { data } = event;
        await prisma.workspace.create({
            data: {
                id: data.id,
                name: data.name,
                slug: data.slug,
                ownerId: data.created_by,
                image_url: data.image_url,
            }
        })
        // Add creator as Admin Membeer
        await prisma.workspaceMember.create({
            data: {
                userId: data.created_by,
                workspaceId: data.id,
                role: 'ADMIN',
            }
        })
    }
)

// Ingest function to update workspace data in the database
const syncWorkspaceUpdation = inngest.createFunction(
    { id: 'update-workspace-from-clerk', triggers: { event: 'clerk/organization.updated' } },
    async ({ event }) => {
        const { data } = event;
        await prisma.workspace.update({
            where: {
                id: data.id,
            },
            data: {
                name: data.name,
                slug: data.slug,
                image_url: data.image_url,
            }
        })
    }
)

// Ingest function to delete workspace data from the database
const syncWorkspaceDeletion = inngest.createFunction(
    { id: 'delete-workspace-from-clerk', triggers: { event: 'clerk/organization.deleted' } },
    async ({ event }) => {
        const { data } = event;
        await prisma.workspace.delete({
            where: {
                id: data.id,
            }
        })
    }
)

// Inngest function to save workspace member data to the database
const syncWorkspaceMemberCreation = inngest.createFunction(
    { id: 'sync-workspace-member-from-clerk', triggers: { event: 'clerk/organizationInvitation.accepted' } },
    async ({ event }) => {
        const { data } = event;
        await prisma.workspaceMember.create({
            data: {
                userId: data.user_id,
                workspaceId: data.organization_id,
                role: String(data.role.name),
            }
        })
    }
)

// Inngest functio to send email on task creation
const sendTaskAssignmentEmail = inngest.createFunction(
    { id: 'send-task-assignment-email', triggers: { event: 'task.assigned' } },
    async ({ event }) => {
        const { taskId, origin } = event.data;

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                assignee: true,
                workspace: true,
            }
        })
        await sendEmail({
            to: task.assignee.email,
            subject: `New Task Assigned: ${task.project.name} - ${task.title}`,
            text: `You have been assigned a new task: ${task.title}. Please check the task details at ${origin}/workspace/${task.workspaceId}/tasks/${task.id}`,
            html: `<p>You have been assigned a new task: <strong>${task.title}</strong>.</p><p>Please check the task details <a href="${origin}/workspace/${task.workspaceId}/tasks/${task.id}">here</a>.</p>`,
        })
        if (new Date(task.dueDate).toLocaleDateString() !== new Date().toDateString()) {
            await step.sleepUntil('wait-until-due-date', new Date(task.dueDate));
            await sendEmail({
                to: task.assignee.email,
                subject: `Task Due Reminder: ${task.project.name} - ${task.title}`,
                text: `This is a reminder that the task "${task.title}" is due today. Please check the task details at ${origin}/workspace/${task.workspaceId}/tasks/${task.id}`,
                html: `<p>This is a reminder that the task "<strong>${task.title}</strong>" is due today.</p><p>Please check the task details <a href="${origin}/workspace/${task.workspaceId}/tasks/${task.id}">here</a>.</p>`,
            })
            await step.run('check-task-completion', async () => {
                const updatedTask = await prisma.task.findUnique({
                    where: { id: taskId },
                });
                if (!updatedTask.completed) {
                    await sendEmail({
                        to: task.assignee.email,
                        subject: `Task Overdue: ${task.project.name} - ${task.title}`,
                        text: `The task "${task.title}" is now overdue. Please check the task details at ${origin}/workspace/${task.workspaceId}/tasks/${task.id}`,
                        html: `<p>The task "<strong>${task.title}</strong>" is now overdue.</p><p>Please check the task details <a href="${origin}/workspace/${task.workspaceId}/tasks/${task.id}">here</a>.</p>`,
                    })
                }
            })
            if (!task) return
            if (task.status !== 'DONE') {
                await step.run('senf-task-remainder-mail', async () => {
                    await sendEmail({
                        to: task.assignee.email,
                        subject: `Task Overdue: ${task.project.name} - ${task.title}`,
                        text: `The task "${task.title}" is now overdue. Please check the task details at ${origin}/workspace/${task.workspaceId}/tasks/${task.id}`,
                        html: `<p>The task "<strong>${task.title}</strong>" is now overdue.</p><p>Please check the task details <a href="${origin}/workspace/${task.workspaceId}/tasks/${task.id}">here</a>.</p>`,
                    })
                }
                )
            }
        }
    }
)

export const functions = [
    syncUserCreation,
    syncUserDeletion,
    syncUserUpdation,
    syncWorkspaceCreation,
    syncWorkspaceUpdation,
    syncWorkspaceDeletion,
    syncWorkspaceMemberCreation,
    sendTaskAssignmentEmail
];