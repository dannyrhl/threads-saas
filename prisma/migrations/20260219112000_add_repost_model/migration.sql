CREATE TABLE "Repost" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "threadId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Repost_userId_threadId_key" ON "Repost"("userId", "threadId");
CREATE INDEX "Repost_userId_idx" ON "Repost"("userId");
CREATE INDEX "Repost_threadId_idx" ON "Repost"("threadId");

ALTER TABLE "Repost" ADD CONSTRAINT "Repost_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Repost" ADD CONSTRAINT "Repost_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
