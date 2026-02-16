const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

function parseThreadId(req, res) {
  const threadId = Number(req.params.id);

  if (!Number.isInteger(threadId) || threadId <= 0) {
    res.status(400).json({ message: 'Invalid thread id' });
    return null;
  }

  return threadId;
}

async function createThread(req, res, next) {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'content is required' });
    }

    if (content.length > 280) {
      return res.status(400).json({ message: 'content must be 280 characters or fewer' });
    }

    const thread = await prisma.thread.create({
      data: {
        content: content.trim(),
        authorId: req.user.id,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            likes: true,
          },
        },
      },
    });

    const { _count, ...threadData } = thread;

    return res.status(201).json({
      thread: {
        ...threadData,
        likeCount: _count.likes,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getAllThreads(req, res, next) {
  try {
    const threads = await prisma.thread.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            likes: true,
          },
        },
      },
    });

    return res.status(200).json({
      threads: threads.map((thread) => {
        const { _count, ...threadData } = thread;
        return {
          ...threadData,
          likeCount: _count.likes,
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteOwnThread(req, res, next) {
  try {
    const threadId = parseThreadId(req, res);
    if (!threadId) {
      return;
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, authorId: true },
    });

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    if (thread.authorId !== req.user.id) {
      return res.status(403).json({ message: 'Thread does not belong to the authenticated user' });
    }

    await prisma.thread.delete({
      where: { id: threadId },
    });

    return res.status(204).send();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2025'
    ) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    return next(error);
  }
}

async function likeThread(req, res, next) {
  try {
    const threadId = parseThreadId(req, res);
    if (!threadId) {
      return;
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    await prisma.like.create({
      data: {
        userId: req.user.id,
        threadId,
      },
    });

    const likeCount = await prisma.like.count({
      where: { threadId },
    });

    return res.status(200).json({ likeCount });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      return res.status(409).json({ message: 'Thread already liked by this user' });
    }

    return next(error);
  }
}

async function unlikeThread(req, res, next) {
  try {
    const threadId = parseThreadId(req, res);
    if (!threadId) {
      return;
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    await prisma.like.delete({
      where: {
        userId_threadId: {
          userId: req.user.id,
          threadId,
        },
      },
    });

    const likeCount = await prisma.like.count({
      where: { threadId },
    });

    return res.status(200).json({ likeCount });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2025'
    ) {
      return res.status(404).json({ message: 'Like not found for this user and thread' });
    }

    return next(error);
  }
}

module.exports = {
  createThread,
  getAllThreads,
  deleteOwnThread,
  likeThread,
  unlikeThread,
};
