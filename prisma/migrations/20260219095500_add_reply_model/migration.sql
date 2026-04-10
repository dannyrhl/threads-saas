CREATE TABLE "Reply" (
    "id" SERIAL NOT NULL,
    "content" VARCHAR(280) NOT NULL,
    "threadId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "parentReplyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reply_threadId_idx" ON "Reply"("threadId");
CREATE INDEX "Reply_authorId_idx" ON "Reply"("authorId");
CREATE INDEX "Reply_parentReplyId_idx" ON "Reply"("parentReplyId");
CREATE INDEX "Reply_createdAt_idx" ON "Reply"("createdAt");

ALTER TABLE "Reply" ADD CONSTRAINT "Reply_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reply" ADD CONSTRAINT "Reply_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reply" ADD CONSTRAINT "Reply_parentReplyId_fkey"
FOREIGN KEY ("parentReplyId") REFERENCES "Reply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
