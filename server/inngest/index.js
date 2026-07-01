import 'dotenv/config'
import SendEmail from '../config/nodemailer.js';
import { createClerkClient } from '@clerk/backend';

if (!process.env.INNGEST_SIGNING_KEY && process.env.INNGEST_SECRET_KEY) {
    process.env.INNGEST_SIGNING_KEY = process.env.INNGEST_SECRET_KEY;
}
import { Inngest, step } from 'inngest'
import { prisma } from '../config/prisma.js';

export const inngest = new Inngest({ id: 'Project Management' })
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const ensureClerkUserInDatabase = async (userId) => {
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });

    if (existingUser) {
        return existingUser;
    }

    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.emailAddresses?.[0]?.emailAddress || `${userId}@clerk.local`;
    const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || email;
    const image = clerkUser.imageUrl || '';

    const existingByEmail = await prisma.user.findUnique({ where: { email } });

    if (existingByEmail) {
        return prisma.user.update({
            where: { email },
            data: {
                id: clerkUser.id,
                name,
                image,
            },
        });
    }

    return prisma.user.create({
        data: {
            id: clerkUser.id,
            email,
            name,
            image,
        },
    });
};

const syncUserCreation = inngest.createFunction(
    { id: "sync-user-from-clerk", triggers: { event: "clerk/user.created" } },
    async ({ event }) => {
        const { data } = event;

        console.log("USER CREATED EVENT:", data.id);

        await prisma.user.upsert({
            where: {
                id: data.id,
            },
            update: {
                email: data.email_addresses?.[0]?.email_address ?? "",
                name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
                image: data.image_url || "",
            },
            create: {
                id: data.id,
                email: data.email_addresses?.[0]?.email_address ?? "",
                name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
                image: data.image_url || "",
            },
        });

        console.log("USER SYNCED:", data.id);
    }
);

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
    {
        id: "sync-workspace-from-clerk",
        triggers: { event: "clerk/organization.created" },
    },
    async ({ event }) => {
        const { data } = event;

        const creatorId = data.created_by;

        console.log("========== ORGANIZATION CREATED ==========");
        console.log("Organization ID:", data.id);
        console.log("Organization Name:", data.name);
        console.log("Creator ID:", creatorId);

        if (!creatorId) {
            throw new Error("Missing created_by on clerk/organization.created event");
        }

        // Check if user already exists
        let user = await prisma.user.findUnique({
            where: { id: creatorId },
        });

        console.log("User before ensure:", user);

        // Create user if missing
        if (!user) {
            console.log("User not found. Fetching from Clerk...");

            try {
                user = await ensureClerkUserInDatabase(creatorId);

                console.log("User created successfully:");
                console.log(user);
            } catch (err) {
                console.error("ensureClerkUserInDatabase FAILED");
                console.error(err);
                throw err;
            }
        }

        // Double check user exists
        const verifyUser = await prisma.user.findUnique({
            where: { id: creatorId },
        });

        console.log("User after ensure:", verifyUser);

        if (!verifyUser) {
            throw new Error(
                `User ${creatorId} still does not exist in database after ensureClerkUserInDatabase()`
            );
        }

        try {
            console.log("Creating workspace...");

            await prisma.workspace.create({
                data: {
                    id: data.id,
                    name: data.name,
                    slug: data.slug,
                    ownerId: creatorId,
                    image_url: data.image_url,
                },
            });

            console.log("Workspace created successfully.");
        } catch (err) {
            console.error("Workspace creation failed:");
            console.error(err);
            throw err;
        }

        try {
            console.log("Creating workspace member...");

            await prisma.workspaceMember.create({
                data: {
                    userId: creatorId,
                    workspaceId: data.id,
                    role: "ADMIN",
                },
            });

            console.log("Workspace member created.");
        } catch (err) {
            console.error("Workspace member creation failed:");
            console.error(err);
            throw err;
        }

        console.log("========== DONE ==========");
    }
);

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