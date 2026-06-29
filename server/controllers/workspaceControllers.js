// Get all workspaces for user 

import { prisma } from "../config/prisma.js";

export const getUserWorkspaces = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const workspaces = await prisma.workspaceMember.findMany({
            where: {
                userId: userId,
            },
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
        });
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

        // Check if the user exists
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!workspaceId || !role) {
            return res.status(400).json({ message: "Workspace ID and role are required" });
        }

        if (!['ADMIN', 'MEMBER'].includes(role)) {
            return res.status(400).json({ message: "Invalid role. Must be 'ADMIN' or 'MEMBER'" });
        }

        //Fetch Workspace
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, include: { members: true } });

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" });
        }

        if (!workspace.members.find((member) => member.userId === user.id && member.role === 'ADMIN')) {
            return res.status(401).json({ message: "Only Admins can add members to the workspace" });
        }

        // check if the user is already a member of the workspace
        const existingMember = workspace.members.find((member) => member.userId === user.id);

        if (existingMember) {
            return res.status(400).json({ message: "User is already a member of the workspace" });
        }

        const member = await prisma.workspaceMember.create({
            data: {
                userId: user.id,
                workspaceId: workspaceId,
                role: role, 
                message: `${user.firstName} ${user.lastName} has been added as a ${role} to the workspace ${workspace.name}`
            }
        })
        res.json({ member, message: "Member added successfully" });
    }

    catch (err) {
        console.error(err);
        res.status(500).json({ message: err.code || err.message });
    }
}