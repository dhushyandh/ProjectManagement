import { prisma } from "../config/prisma.js";
import { clerkClient } from "@clerk/express";

export const protect = async (req, res, next) => {
  try {
    const { userId } = await req.auth();

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!existing) {
      const user = await clerkClient.users.getUser(userId);

      await prisma.user.create({
        data: {
          id: user.id,
          email: user.emailAddresses[0].emailAddress,
          name: `${user.firstName ?? ""} ${user.lastName ?? ""}`,
          image: user.imageUrl ?? "",
        }
      });
    }

    next();

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server Error" });
  }
};