import { prisma } from "../config/prisma.js";
import { clerkClient } from "@clerk/express";

const syncClerkUser = async (userId) => {
  const clerkUser = await clerkClient.users.getUser(userId);
  const email = clerkUser.emailAddresses?.[0]?.emailAddress;
  const name = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || email || userId;
  const image = clerkUser.imageUrl ?? "";

  const existingById = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (existingById) {
    return existingById;
  }

  if (email) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingByEmail) {
      return prisma.user.update({
        where: { email },
        data: {
          id: userId,
          name,
          image,
        },
      });
    }
  }

  return prisma.user.create({
    data: {
      id: userId,
      email: email || `${userId}@clerk.local`,
      name,
      image,
    },
  });
};

export const protect = async (req, res, next) => {
  try {
    const { userId } = await req.auth();

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await syncClerkUser(userId);

    next();

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server Error" });
  }
};