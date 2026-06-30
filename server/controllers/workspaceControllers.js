// Get all workspaces for user 

import { createClerkClient } from '@clerk/backend';
import { prisma } from "../config/prisma.js";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export const getUserWorkspaces = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const workspaceMemberships = await prisma.workspaceMember.findMany({
            where: {
                userId: userId,
            },
            include: {
                workspace: {
                    include: {
                        members: { include: { user: true } },
                        projects: {
                            include: {
                                tasks: { include: { assignee: true, comments: { include: { user: true } } } },
                                members: { include: { user: true } }
                            }
                        },
                        owner: true,
                    }
                }
            }
        });

        const workspaces = workspaceMemberships.map((membership) => membership.workspace);
        res.json({ workspaces });


    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: err.code || err.message });
    }
}

// Add member to workspace
export const addMember = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { email, role, workspaceId } = req.body;
        const normalizedRole = role === 'org:admin' ? 'ADMIN' : 'MEMBER';

        let invitedUser = await prisma.user.findUnique({ where: { email } });

        if (!invitedUser) {
            try {
                const clerkUsers = await clerkClient.users.getUserList({ emailAddress: [email] });
                const clerkUser = clerkUsers.data?.[0];

                if (clerkUser) {
                    invitedUser = await prisma.user.create({
                        data: {
                            id: clerkUser.id,
                            email: clerkUser.emailAddresses?.[0]?.emailAddress || email,
                            name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || email,
                            image: clerkUser.imageUrl || '',
                        },
                    });
                }
            } catch (clerkError) {
                console.error('Unable to sync invited user from Clerk:', clerkError);
            }
        }

        if (!invitedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!workspaceId || !role) {
            return res.status(400).json({ message: "Workspace ID and role are required" });
        }

        if (!['ADMIN', 'MEMBER'].includes(normalizedRole)) {
            return res.status(400).json({ message: "Invalid role. Must be 'ADMIN' or 'MEMBER'" });
        }

        //Fetch Workspace
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, include: { members: true } });

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" });
        }

        const isAdmin = workspace.members.some((member) => member.userId === userId && member.role === 'ADMIN') || workspace.ownerId === userId;

        if (!isAdmin) {
            return res.status(401).json({ message: "Only Admins can add members to the workspace" });
        }

        // check if the user is already a member of the workspace
        const existingMember = workspace.members.find((member) => member.userId === invitedUser.id);

        if (existingMember) {
            return res.json({ member: existingMember, message: "User is already a member of the workspace" });
        }

        const member = await prisma.workspaceMember.create({
            data: {
                userId: invitedUser.id,
                workspaceId: workspaceId,
                role: normalizedRole,
                message: `${invitedUser.name} has been added as a ${normalizedRole.toLowerCase()} to the workspace ${workspace.name}`
            }
        })
        res.json({ member, message: "Member added successfully" });
    }

    catch (err) {
        console.error(err);
        res.status(500).json({ message: err.code || err.message });
    }
}