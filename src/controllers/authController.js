const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { signAccessToken } = require('../utils/token');
const {
  BOT_DOMAIN,
  botsEnabled,
  ensureBots,
  isBotEmail,
} = require('../services/botEngine');

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function makeRandomEmail(base) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  return `${base}.${suffix}@demo.local`;
}

async function ensureBotNetworkForUser(userId) {
  if (!botsEnabled()) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!user || isBotEmail(user.email)) return;

  await ensureBots();

  const bots = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: `@${BOT_DOMAIN}` } },
        { email: { endsWith: `.${BOT_DOMAIN}` } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 3,
    select: { id: true },
  });

  if (bots.length === 0) return;

  const outgoing = bots.slice(0, 2);
  for (const bot of outgoing) {
    await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: bot.id,
        },
      },
      create: {
        followerId: user.id,
        followingId: bot.id,
        status: 'accepted',
        respondedAt: new Date(),
      },
      update: {
        status: 'accepted',
        respondedAt: new Date(),
      },
    });
  }

  const incomingByBots = await prisma.follow.findMany({
    where: {
      followingId: user.id,
      followerId: {
        in: bots.map((bot) => bot.id),
      },
    },
    select: { id: true, followerId: true, status: true },
  });

  const hasPendingIncoming = incomingByBots.some((entry) => entry.status === 'pending');
  if (hasPendingIncoming) return;

  const usedFollowerIds = new Set(incomingByBots.map((entry) => entry.followerId));
  const availableIncomingBot = bots.find((bot) => !usedFollowerIds.has(bot.id));

  if (availableIncomingBot) {
    await prisma.follow.create({
      data: {
        followerId: availableIncomingBot.id,
        followingId: user.id,
        status: 'pending',
      },
    });
    return;
  }

  const rejectedIncoming = incomingByBots.find((entry) => entry.status === 'rejected');
  if (rejectedIncoming) {
    await prisma.follow.update({
      where: { id: rejectedIncoming.id },
      data: {
        status: 'pending',
        respondedAt: null,
      },
    });
  }
}

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    const token = signAccessToken(user.id);

    await ensureBotNetworkForUser(user.id);

    return res.status(201).json({
      token,
      user,
    });
  } catch (error) {
    return next(error);
  }
}

async function createDemoProfiles(req, res, next) {
  try {
    const names = ['Ava Stone', 'Noah Park', 'Mia Cruz', 'Leo Quinn'];
    const demoVideoUrls = [
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    ];
    const demoStarters = [
      {
        mediaType: 'photo',
        content: 'Meme-Moment aus dem Teamalltag: erst Kaffee, dann Deploy.',
      },
      {
        mediaType: 'video',
        content: 'Kurzer Clip vom Training-Flow mit klaren Schritten.',
      },
      {
        mediaType: 'video',
        content: 'Produkt-Demo im Clip: neuer Flow in 20 Sekunden erklart.',
      },
      {
        mediaType: 'video',
        content: 'News-Recap im Video: die wichtigsten Produkttrends diese Woche.',
      },
    ];

    const passwordHash = await bcrypt.hash('demo-password', 12);

    const createdUsers = [];

    // Create 4 demo users with one starter thread each.
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      const emailBase = name.toLowerCase().replace(/\s+/g, '.');

      const user = await prisma.user.create({
        data: {
          name,
          email: makeRandomEmail(emailBase),
          passwordHash,
        },
      });

      await prisma.thread.create({
        data: {
          authorId: user.id,
          content: demoStarters[index].content,
          mediaType: demoStarters[index].mediaType,
          mediaUrl: demoStarters[index].mediaType === 'photo'
            ? `https://picsum.photos/seed/${user.id}/720/900`
            : demoVideoUrls[index % demoVideoUrls.length],
        },
      });

      createdUsers.push(user);
    }

    return res.status(201).json({
      createdCount: createdUsers.length,
      profiles: createdUsers.map(sanitizeUser),
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signAccessToken(user.id);

    await ensureBotNetworkForUser(user.id);

    return res.status(200).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
}

async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await ensureBotNetworkForUser(user.id);

    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
}

async function updateMe(req, res, next) {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: name.trim(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    return res.status(200).json({ user: updated });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  createDemoProfiles,
  login,
  me,
  updateMe,
};
