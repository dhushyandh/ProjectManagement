import { prisma } from '../config/prisma.js'
import {inngest} from '../inngest/index.js'
// Create task 

export const createTask = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { title, description, type, status, priority, projectId, assigneeId, due_date } = req.body;
        const origin = req.get('origin');

        //check if user is project lead or admin of workspace
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { members: { include: { user: true } } }
        })
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }
        else if (project.team_lead !== userId) {
            return res.status(403).json({ message: "You do not have permission to create task for this project" });
        }
        else if (assigneeId && !project.members.find((member) => member.userId == assigneeId)) {
            return res.status(403).json({ message: "Assignee is not a member of this project" });
        }
        const task = await prisma.task.create({
            data: {
                title,
                description,
                type,
                status,
                priority,
                project: { connect: { id: projectId } },
                assignee: assigneeId ? { connect: { id: assigneeId } } : undefined,
                due_date: due_date ? new Date(due_date) : null,
            },
        });

        const taskWithAssignee = await prisma.task.findUnique({
            where: { id: task.id },
            include: { assignee: true }
        });

        await inngest.send({
            name: "app/task.assigned",
            data: { taskId: task.id, origin }
        });

        res.status(201).json({ message: "Task created successfully", task: taskWithAssignee });

    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }

}

// update task
export const updateTask = async (req, res) => {
    try {
        const task = await prisma.task.findUnique({
            where: { id: req.params.id },
        });
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        const { userId } = await req.auth();
        // const { title, description, type, status, priority, projectId, priority, assigneeId, due_date } = req.body;
        // const origin = req.get('origin');

        //check if user is project lead or admin of workspace
        const project = await prisma.project.findUnique({
            where: { id: task.projectId },
            include: { members: { include: { user: true } } }
        })
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }
        else if (project.team_lead !== userId) {
            return res.status(403).json({ message: "You do not have permission to update this task" });
        }
        const updatedTask = await prisma.task.update({
            where: { id: req.params.id },
            data: req.body
        })
        res.status(201).json({ message: "Task updated successfully", task: updatedTask });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}
// delete task
export const deleteTask = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { tasksIds } = req.body;
        const tasks = await prisma.task.findMany({
            where: { id: { in: tasksIds } },
        });
        if (tasks.length === 0) {
            return res.status(404).json({ message: "Tasks not found" });
        }

        const project = await prisma.project.findUnique({
            where: { id: tasks[0].projectId },
            include: { members: { include: { user: true } } }
        })
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }
        else if (project.team_lead !== userId) {
            return res.status(403).json({ message: "You do not have permission to delete this task" });
        }
        const deletedTasks = await prisma.task.deleteMany({
            where: { id: { in: tasksIds } },

        })
        res.status(201).json({ message: "Task deleted successfully", task: deletedTasks });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}