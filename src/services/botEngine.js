const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

const BOT_DOMAIN = 'bot.local';
const BOT_PASSWORD = 'bot-password';
const BOTS_ENABLED = String(process.env.ENABLE_BOTS || '').toLowerCase() === 'true';
const BOT_NAMES = [
  'Nova Loop',
  'Milo Pulse',
  'Lina Flux',
  'Kai Orbit',
  'Zoe Byte',
  'Rex Drift',
  'Ivy Spark',
  'Niko Frame',
  'Tara Shift',
  'Vera Grid',
];
const POST_STYLE_SEQUENCE = ['meme', 'factual', 'meme', 'news'];
const TARGET_PENDING_REQUESTS_PER_USER = 4;
const REJECTED_REQUEST_RETRY_MS = 10 * 60 * 1000;
const POST_TEMPLATES = {
  meme: {
    text: [
      'Wenn der Build grun ist, aber die QA noch 12 Bugs findet.',
      'POV: Du fixt einen Bug und erzeugst drei neue.',
      'Heute im Release-Karaoke: "works on my machine" als Remix.',
      'Sprint-Realitat: erst Kaffee, dann Chaos, dann Patch.',
    ],
    photo: [
      'Dieses Bild hat mehr Kontext als unser letztes Standup.',
      'Mood vom Team nach dem Hotfix: vorsichtig optimistisch.',
      'Meme des Tages fur alle, die noch im Incident-Call hangen.',
      'Visual summary vom Sprint: bisschen Chaos, viel Humor.',
    ],
    video: [
      'Clip vom Deployment-Moment, bevor jemand "rollback" ruft.',
      'Kurzes Video: so sieht ein stabiler Build fur 30 Sekunden aus.',
      'POV im Video: alle warten auf den finalen Green Check.',
      'Das Video zeigt exakt die Energie vor dem Release.',
    ],
  },
  factual: {
    text: [
      'Heute Fokus auf Stabilitat: kleinere Changes, klar messbare Wirkung.',
      'Wir haben den Onboarding-Flow vereinfacht und Drop-offs reduziert.',
      'Quick update: Antwortzeiten verbessert, Fehlerquote gesenkt.',
      'Produktarbeit heute: weniger Scope, mehr saubere Umsetzung.',
    ],
    photo: [
      'Screenshot vom aktuellen Dashboard: Trends sehen stabiler aus.',
      'Neue UI-Iteration im Bild, Fokus auf Klarheit statt Dekoration.',
      'Foto vom aktuellen Stand: weniger Reibung in den Kernschritten.',
      'Visuelles Update zum Fortschritt im Feature-Rollout.',
    ],
    video: [
      'Kurzer Walkthrough vom neuen Flow im echten Nutzungsszenario.',
      'Video-Demo: Performance unter Last bleibt im Zielbereich.',
      'Clip mit Vorher/Nachher-Vergleich der wichtigsten Interaktion.',
      'Produktvideo aus dem Testlauf mit realistischen Inputs.',
    ],
  },
  news: {
    text: [
      'Branchenblick: Teams investieren wieder starker in Zuverlassigkeit.',
      'News-Take: Nutzer erwarten heute mehr Transparenz bei Updates.',
      'Heute relevant: Geschwindigkeit zahlt, aber Vertrauen zahlt mehr.',
      'Markt-Notiz: kleine Produktverbesserungen schlagen oft grosse Relaunches.',
    ],
    photo: [
      'News-Visual: zentrale Kennzahl zeigt einen klaren Aufwartstrend.',
      'Bild zum Update: Fokus in der Branche liegt wieder auf Quality.',
      'Visual zur aktuellen Lage: stabile Releases werden sichtbar priorisiert.',
      'Snapshot aus dem Report: UX-Verbesserungen bleiben Top-Thema.',
    ],
    video: [
      'Kurzer News-Recap im Video mit den wichtigsten Produkt-Signalen.',
      'Video-Update: die drei Trends, die Teams gerade wirklich bewegen.',
      'Clip zur Einordnung der aktuellen Branchen-Entwicklungen.',
      'Mini-News-Briefing als Video fur den schnellen Uberblick.',
    ],
  },
};
const REPLY_TEMPLATES = {
  meme: {
    text: [
      'Fuhl ich. Genau so sehen viele Releases in echt aus.',
      'Sehr treffend, vor allem fur Teams mit engem Zeitfenster.',
      'Der Punkt sitzt. Das kennen vermutlich alle aus der Praxis.',
      'Das ist bitter und lustig zugleich, also ziemlich realistisch.',
    ],
    photo: [
      'Das Bild bringt die Aussage sofort auf den Punkt.',
      'Starkes Meme-Bild, Kontext versteht man ohne Erklarung.',
      'Visuell sehr passend, macht den Thread deutlich starker.',
      'Der Foto-Moment tragt die ganze Aussage.',
    ],
    video: [
      'Der Clip timingt den Joke perfekt.',
      'Video passt top zum Ton vom Thread.',
      'Der Ablauf im Clip macht die Aussage noch klarer.',
      'Guter Cut im Video, die Pointe kommt direkt an.',
    ],
  },
  factual: {
    text: [
      'Klarer Punkt. Ein kurzer Vergleichswert ware noch spannend.',
      'Das klingt solide. Wie habt ihr den Effekt gemessen?',
      'Sauber formuliert. Mit einem Beispiel ware es noch greifbarer.',
      'Gute Richtung. Gerade die konkrete Umsetzung ist hier stark.',
    ],
    photo: [
      'Das Bild unterstutzt den Sachpunkt gut.',
      'Visual und Aussage passen hier wirklich sauber zusammen.',
      'Guter Screenshot-Kontext, macht den Nutzen direkt sichtbar.',
      'Foto ist hilfreich, weil der Fortschritt konkret wird.',
    ],
    video: [
      'Die Video-Demo macht den Unterschied klar nachvollziehbar.',
      'Starker Clip, man sieht den Effekt ohne viel Erklarung.',
      'Guter Walkthrough, der Kontext ist direkt klar.',
      'Video passt sehr gut zur argumentierten Verbesserung.',
    ],
  },
  news: {
    text: [
      'Gute Einordnung. Das Thema wird gerade wirklich oft diskutiert.',
      'Spannender News-Winkel, besonders mit Blick auf die Entwicklung.',
      'Danke fur den Update-Post, passt zur aktuellen Marktlage.',
      'Solider Hinweis, das bleibt fur viele Teams relevant.',
    ],
    photo: [
      'Das Visual wirkt wie ein guter News-Snapshot.',
      'Foto unterstutzt den News-Kontext sehr klar.',
      'Das Bild macht die Einordnung deutlich leichter.',
      'Guter visueller Anker fur den News-Thread.',
    ],
    video: [
      'Der Video-Recap passt gut zur News-Perspektive.',
      'Starker Clip fur ein kompaktes Update.',
      'Video hilft, die News schnell einzuordnen.',
      'Gutes Format, um die Entwicklung knapp zu erklaren.',
    ],
  },
};
const THREAD_KEYWORDS = {
  news: ['news', 'update', 'breaking', 'trend', 'markt', 'report', 'bericht', 'aktuell'],
  meme: ['meme', 'lol', 'funny', 'chaos', 'joke', 'pov', 'witz', 'haha'],
};
const DM_REPLY_TEMPLATES = [
  'Danke fur deine Nachricht. Ich antworte gern auf deinen nachsten Post wieder.',
  'Klingt gut. Schick mir gern ein Update, dann kann ich direkt reagieren.',
  'Starker Punkt. Ich poste gleich noch eine Reaktion dazu.',
  'Gesehen. Ich gebe dir gleich Feedback mit einem Reply.',
];
const DM_TEMPLATES = [
  'Hey! I saw your recent post. Want feedback on the next one too?',
  'Quick note: your thread has good momentum, keep posting in this direction.',
  'I can repost your next update if you keep it concise and specific.',
  'Your post topic is strong. A follow-up with a concrete example would work well.',
  'Nice thread. If you want, I can share one practical counterpoint as reply.',
];
const MEME_URLS = [
  'https://i.imgflip.com/1bij.jpg',
  'https://i.imgflip.com/26am.jpg',
  'https://i.imgflip.com/30b1gx.jpg',
  'https://i.imgflip.com/2wifvo.jpg',
  'https://i.imgflip.com/3si4.jpg',
];
const VIDEO_URLS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
];
const PHOTO_DIMENSIONS = [
  { width: 720, height: 900 },
  { width: 1080, height: 1350 },
  { width: 1280, height: 720 },
  { width: 900, height: 900 },
  { width: 1080, height: 1080 },
];

let intervalId = null;
let isRunning = false;
let nextPostWithMedia = false;
let nextPostStyleIndex = 0;

function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function createBotPhotoUrl(botId, style) {
  const dims = randomFrom(PHOTO_DIMENSIONS);
  const effects = randomFrom(['', '?grayscale', '?blur=1', '?blur=2', '?']);
  const queryTail = effects === '?' ? `?random=${Math.floor(Math.random() * 10_000)}` : effects;
  return `https://picsum.photos/seed/bot-${botId}-${style}-${Date.now()}-${Math.floor(Math.random() * 9999)}/${dims.width}/${dims.height}${queryTail}`;
}

function isBotEmail(email) {
  return typeof email === 'string'
    && (email.endsWith(`@${BOT_DOMAIN}`) || email.endsWith(`.${BOT_DOMAIN}`));
}

function makeBotEmail(name) {
  return `${name.toLowerCase().replace(/\s+/g, '.')}@${BOT_DOMAIN}`.replace('..', '.');
}

function isBotUser(userOrEmail) {
  if (!userOrEmail) return false;
  if (typeof userOrEmail === 'string') return isBotEmail(userOrEmail);
  return isBotEmail(userOrEmail.email);
}

function botsEnabled() {
  return BOTS_ENABLED;
}

function getPostStyle() {
  const style = POST_STYLE_SEQUENCE[nextPostStyleIndex % POST_STYLE_SEQUENCE.length];
  nextPostStyleIndex += 1;
  return style;
}

function inferThreadStyle(thread) {
  const content = (thread.content || '').toLowerCase();

  for (const keyword of THREAD_KEYWORDS.news) {
    if (content.includes(keyword)) return 'news';
  }

  for (const keyword of THREAD_KEYWORDS.meme) {
    if (content.includes(keyword)) return 'meme';
  }

  if (thread.mediaUrl && MEME_URLS.includes(thread.mediaUrl)) {
    return 'meme';
  }

  return 'factual';
}

function getPostToneByMedia(style, mediaType, mediaUrl) {
  if (mediaType === 'video') return randomFrom(POST_TEMPLATES[style].video);
  if (mediaType === 'photo' && mediaUrl && MEME_URLS.includes(mediaUrl)) return randomFrom(POST_TEMPLATES.meme.photo);
  if (mediaType === 'photo') return randomFrom(POST_TEMPLATES[style].photo);
  return randomFrom(POST_TEMPLATES[style].text);
}

function buildReplyContent(thread) {
  const style = inferThreadStyle(thread);
  const replies = REPLY_TEMPLATES[style] || REPLY_TEMPLATES.factual;

  if (thread.mediaType === 'video') return randomFrom(replies.video);
  if (thread.mediaType === 'photo' && thread.mediaUrl && MEME_URLS.includes(thread.mediaUrl)) {
    return randomFrom(REPLY_TEMPLATES.meme.photo);
  }
  if (thread.mediaType === 'photo') return randomFrom(replies.photo);
  return randomFrom(replies.text);
}

async function ensureBots() {
  const passwordHash = await bcrypt.hash(BOT_PASSWORD, 10);

  for (const name of BOT_NAMES) {
    const email = makeBotEmail(name);
    const legacyEmail = `${name.toLowerCase().replace(/\s+/g, '.')}.${BOT_DOMAIN}`.replace('..', '.');
    const canonicalOwner = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    const existingBots = await prisma.user.findMany({
      where: {
        OR: [
          { email },
          { email: legacyEmail },
          {
            AND: [
              { name },
              {
                OR: [
                  { email: { endsWith: `@${BOT_DOMAIN}` } },
                  { email: { endsWith: `.${BOT_DOMAIN}` } },
                ],
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });

    const scopedBots = existingBots.filter((bot) => {
      if (bot.email === email) return true;
      return bot.email.endsWith(`@${BOT_DOMAIN}`) || bot.email.endsWith(`.${BOT_DOMAIN}`);
    });

    if (!canonicalOwner && scopedBots.length === 0) {
      await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
        },
      });
      continue;
    }

    let keeper = canonicalOwner || scopedBots[0];
    const duplicates = scopedBots.filter((bot) => bot.id !== keeper.id);

    if (!canonicalOwner && keeper.email !== email) {
      await prisma.user.update({
        where: { id: keeper.id },
        data: { email, name },
      });
    } else if (canonicalOwner && canonicalOwner.name !== name) {
      await prisma.user.update({
        where: { id: canonicalOwner.id },
        data: { name },
      });
    }

    for (const duplicate of duplicates) {
      await prisma.user.delete({
        where: { id: duplicate.id },
      });
    }
  }
}

async function postAsBot(bots) {
  if (bots.length === 0) return;

  const bot = randomFrom(bots);
  const withMedia = nextPostWithMedia;
  nextPostWithMedia = !nextPostWithMedia;
  let mediaType = null;
  let mediaUrl = null;
  const style = getPostStyle();

  if (withMedia) {
    const pick = Math.random();
    if (pick < 0.2) {
      mediaType = 'photo';
      mediaUrl = createBotPhotoUrl(bot.id, style);
    } else if (pick < 0.45) {
      mediaType = 'photo';
      mediaUrl = randomFrom(MEME_URLS);
    } else {
      mediaType = 'video';
      mediaUrl = randomFrom(VIDEO_URLS);
    }
  }

  await prisma.thread.create({
    data: {
      authorId: bot.id,
      content: getPostToneByMedia(style, mediaType, mediaUrl),
      mediaType,
      mediaUrl,
    },
  });
}

async function createBotFollowRequests(bots) {
  if (bots.length === 0) return;

  const users = await prisma.user.findMany({
    where: {
      NOT: [
        { email: { endsWith: `@${BOT_DOMAIN}` } },
        { email: { endsWith: `.${BOT_DOMAIN}` } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true },
  });

  if (users.length === 0) return;

  const now = Date.now();

  // Ensure users receive frequent pending bot requests.
  for (const user of users) {
    const existingByBot = await prisma.follow.findMany({
      where: {
        followingId: user.id,
        followerId: {
          in: bots.map((bot) => bot.id),
        },
      },
      select: {
        id: true,
        followerId: true,
        status: true,
        respondedAt: true,
      },
    });

    let pendingCount = existingByBot.filter((entry) => entry.status === 'pending').length;
    const usedBotIds = new Set(existingByBot.map((entry) => entry.followerId));
    const availableBots = bots.filter((bot) => !usedBotIds.has(bot.id));

    while (pendingCount < TARGET_PENDING_REQUESTS_PER_USER && availableBots.length > 0) {
      const availableBot = availableBots.shift();
      if (!availableBot) break;
      await prisma.follow.create({
        data: {
          followerId: availableBot.id,
          followingId: user.id,
          status: 'pending',
        },
      });
      pendingCount += 1;
    }

    if (pendingCount >= TARGET_PENDING_REQUESTS_PER_USER) {
      continue;
    }

    const rejectedEntries = existingByBot.filter((entry) => (
      entry.status === 'rejected'
      && entry.respondedAt
      && now - new Date(entry.respondedAt).getTime() > REJECTED_REQUEST_RETRY_MS
    ));

    for (const rejectedEntry of rejectedEntries) {
      if (pendingCount >= TARGET_PENDING_REQUESTS_PER_USER) break;
      await prisma.follow.update({
        where: { id: rejectedEntry.id },
        data: {
          status: 'pending',
          respondedAt: null,
        },
      });
      pendingCount += 1;
    }
  }
}

async function acceptPendingRequestsToBots() {
  const pendingRequests = await prisma.follow.findMany({
    where: {
      status: 'pending',
    },
    include: {
      follower: {
        select: { id: true, email: true },
      },
      following: {
        select: { id: true, email: true },
      },
    },
    take: 120,
  });

  if (pendingRequests.length === 0) return;

  const requestsToAccept = pendingRequests.filter((request) => (
    isBotUser(request.following) && !isBotUser(request.follower)
  ));

  if (requestsToAccept.length === 0) return;

  await prisma.follow.updateMany({
    where: {
      id: {
        in: requestsToAccept.map((request) => request.id),
      },
      status: 'pending',
    },
    data: {
      status: 'accepted',
      respondedAt: new Date(),
    },
  });
}

async function interactAsBot(bots) {
  if (bots.length === 0) return;

  const recentThreads = await prisma.thread.findMany({
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: {
      id: true,
      content: true,
      mediaType: true,
      mediaUrl: true,
      authorId: true,
    },
  });

  if (recentThreads.length === 0) return;

  const actionCount = 10 + Math.floor(Math.random() * 8);

  for (let i = 0; i < actionCount; i += 1) {
    const bot = randomFrom(bots);
    const thread = randomFrom(recentThreads);

    if (!bot || !thread || bot.id === thread.authorId) continue;

    const actionRoll = Math.random();

    if (actionRoll < 0.2) {
      await prisma.like.upsert({
        where: {
          userId_threadId: {
            userId: bot.id,
            threadId: thread.id,
          },
        },
        create: {
          userId: bot.id,
          threadId: thread.id,
        },
        update: {},
      });
      continue;
    }

    if (actionRoll < 0.45) {
      const hasReply = await prisma.reply.findFirst({
        where: {
          threadId: thread.id,
          authorId: bot.id,
        },
        select: { id: true },
      });

      if (!hasReply) {
        await prisma.reply.create({
          data: {
            threadId: thread.id,
            authorId: bot.id,
            content: buildReplyContent(thread),
          },
        });
      }
      continue;
    }

    await prisma.repost.upsert({
      where: {
        userId_threadId: {
          userId: bot.id,
          threadId: thread.id,
        },
      },
      create: {
        userId: bot.id,
        threadId: thread.id,
      },
      update: {},
    });
  }
}

async function increaseBotToBotInteractions(bots) {
  if (bots.length < 2) return;

  const botIds = bots.map((bot) => bot.id);
  const botThreads = await prisma.thread.findMany({
    where: {
      authorId: {
        in: botIds,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 45,
    select: {
      id: true,
      content: true,
      mediaType: true,
      mediaUrl: true,
      authorId: true,
    },
  });

  if (botThreads.length === 0) return;

  const rounds = 12 + Math.floor(Math.random() * 10);

  for (let i = 0; i < rounds; i += 1) {
    const actor = randomFrom(bots);
    const thread = randomFrom(botThreads);
    if (!actor || !thread || actor.id === thread.authorId) continue;

    const roll = Math.random();

    if (roll < 0.45) {
      await prisma.like.upsert({
        where: {
          userId_threadId: {
            userId: actor.id,
            threadId: thread.id,
          },
        },
        create: {
          userId: actor.id,
          threadId: thread.id,
        },
        update: {},
      });
      continue;
    }

    if (roll < 0.82) {
      const hasReply = await prisma.reply.findFirst({
        where: {
          threadId: thread.id,
          authorId: actor.id,
        },
        select: { id: true },
      });

      if (!hasReply) {
        await prisma.reply.create({
          data: {
            threadId: thread.id,
            authorId: actor.id,
            content: buildReplyContent(thread),
          },
        });
      }
      continue;
    }

    await prisma.repost.upsert({
      where: {
        userId_threadId: {
          userId: actor.id,
          threadId: thread.id,
        },
      },
      create: {
        userId: actor.id,
        threadId: thread.id,
      },
      update: {},
    });
  }
}

async function ensureBotsLikeRecentUserThreads(bots) {
  if (bots.length === 0) return;

  const recentUserThreads = await prisma.thread.findMany({
    where: {
      author: {
        NOT: [
          { email: { endsWith: `@${BOT_DOMAIN}` } },
          { email: { endsWith: `.${BOT_DOMAIN}` } },
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      authorId: true,
    },
  });

  for (const thread of recentUserThreads) {
    const candidateBots = bots.filter((bot) => bot.id !== thread.authorId);
    const liker = randomFrom(candidateBots);
    if (!liker) continue;

    await prisma.like.upsert({
      where: {
        userId_threadId: {
          userId: liker.id,
          threadId: thread.id,
        },
      },
      create: {
        userId: liker.id,
        threadId: thread.id,
      },
      update: {},
    });
  }
}

async function enforceKaiOnNovaInteraction() {
  const [kai, nova] = await Promise.all([
    prisma.user.findUnique({
      where: { email: makeBotEmail('Kai Orbit') },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { email: makeBotEmail('Nova Loop') },
      select: { id: true },
    }),
  ]);

  if (!kai || !nova || kai.id === nova.id) return;

  const novaThread = await prisma.thread.findFirst({
    where: { authorId: nova.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, content: true, mediaType: true, mediaUrl: true },
  });

  if (!novaThread) return;

  await prisma.like.upsert({
    where: {
      userId_threadId: {
        userId: kai.id,
        threadId: novaThread.id,
      },
    },
    create: {
      userId: kai.id,
      threadId: novaThread.id,
    },
    update: {},
  });

  const kaiReply = await prisma.reply.findFirst({
    where: {
      threadId: novaThread.id,
      authorId: kai.id,
    },
    select: { id: true },
  });

  if (!kaiReply) {
    await prisma.reply.create({
      data: {
        threadId: novaThread.id,
        authorId: kai.id,
        content: buildReplyContent(novaThread),
      },
    });
  }
}

async function sendBotMessages(bots) {
  if (bots.length === 0) return;

  const targets = await prisma.follow.findMany({
    where: {
      follower: {
        OR: [
          { email: { endsWith: `@${BOT_DOMAIN}` } },
          { email: { endsWith: `.${BOT_DOMAIN}` } },
        ],
      },
      status: 'accepted',
    },
    select: {
      followingId: true,
      followerId: true,
    },
    take: 120,
  });

  if (targets.length === 0) return;

  const messageCount = Math.min(4, targets.length);

  for (let i = 0; i < messageCount; i += 1) {
    const target = randomFrom(targets);
    if (!target) continue;

    const alreadySentRecently = await prisma.directMessage.findFirst({
      where: {
        senderId: target.followerId,
        recipientId: target.followingId,
        createdAt: {
          gte: new Date(Date.now() - 25 * 60 * 1000),
        },
      },
      select: { id: true },
    });

    if (alreadySentRecently) continue;

    await prisma.directMessage.create({
      data: {
        senderId: target.followerId,
        recipientId: target.followingId,
        content: randomFrom(DM_TEMPLATES),
      },
    });
  }
}

async function respondToIncomingUserMessages() {
  const incoming = await prisma.directMessage.findMany({
    where: {
      sender: {
        NOT: [
          { email: { endsWith: `@${BOT_DOMAIN}` } },
          { email: { endsWith: `.${BOT_DOMAIN}` } },
        ],
      },
      recipient: {
        OR: [
          { email: { endsWith: `@${BOT_DOMAIN}` } },
          { email: { endsWith: `.${BOT_DOMAIN}` } },
        ],
      },
      createdAt: {
        gte: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: { id: true } },
      recipient: { select: { id: true } },
    },
    take: 80,
  });

  if (incoming.length === 0) return;

  let repliesSent = 0;
  const handledPairs = new Set();

  for (const message of incoming) {
    if (repliesSent >= 6) break;
    const pairKey = `${message.senderId}-${message.recipientId}`;
    if (handledPairs.has(pairKey)) continue;
    handledPairs.add(pairKey);

    const botAlreadyReplied = await prisma.directMessage.findFirst({
      where: {
        senderId: message.recipientId,
        recipientId: message.senderId,
        createdAt: {
          gt: message.createdAt,
        },
      },
      select: { id: true },
    });

    if (botAlreadyReplied) continue;

    await prisma.directMessage.create({
      data: {
        senderId: message.recipientId,
        recipientId: message.senderId,
        content: randomFrom(DM_REPLY_TEMPLATES),
      },
    });
    repliesSent += 1;
  }
}

async function runBotCycle() {
  if (!botsEnabled()) return;
  if (isRunning) return;
  isRunning = true;

  try {
    await ensureBots();
    const bots = await prisma.user.findMany({
      where: {
        OR: [
          { email: { endsWith: `@${BOT_DOMAIN}` } },
          { email: { endsWith: `.${BOT_DOMAIN}` } },
        ],
      },
      select: { id: true, email: true },
    });

    await postAsBot(bots);
    await ensureBotsLikeRecentUserThreads(bots);
    await interactAsBot(bots);
    await increaseBotToBotInteractions(bots);
    await createBotFollowRequests(bots);
    await acceptPendingRequestsToBots();
    await enforceKaiOnNovaInteraction();
    await sendBotMessages(bots);
    await respondToIncomingUserMessages();
  } catch (error) {
    console.error('[bot-engine] cycle failed:', error.message);
  } finally {
    isRunning = false;
  }
}

async function startBotEngine() {
  if (!botsEnabled()) return;
  await runBotCycle();

  intervalId = setInterval(() => {
    runBotCycle();
  }, 180_000);

  if (intervalId.unref) {
    intervalId.unref();
  }
}

async function removeAllBots() {
  const deleted = await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: `@${BOT_DOMAIN}` } },
        { email: { endsWith: `.${BOT_DOMAIN}` } },
      ],
    },
  });

  return deleted.count || 0;
}

module.exports = {
  BOT_DOMAIN,
  ensureBots,
  isBotEmail,
  botsEnabled,
  removeAllBots,
  startBotEngine,
};
