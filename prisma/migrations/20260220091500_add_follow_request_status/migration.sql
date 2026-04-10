CREATE TYPE "FollowStatus" AS ENUM ('pending', 'accepted', 'rejected');

ALTER TABLE "Follow"
ADD COLUMN "status" "FollowStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "respondedAt" TIMESTAMP(3);

CREATE INDEX "Follow_followingId_status_idx" ON "Follow"("followingId", "status");
CREATE INDEX "Follow_followerId_status_idx" ON "Follow"("followerId", "status");
