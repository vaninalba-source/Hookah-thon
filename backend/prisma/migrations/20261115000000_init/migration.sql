CREATE TABLE "User" (
 "id" UUID NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
 CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Todo" (
 "id" UUID NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
 "completed" BOOLEAN NOT NULL DEFAULT false, "userId" UUID NOT NULL,
 CONSTRAINT "Todo_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Todo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Todo_userId_idx" ON "Todo"("userId");
CREATE TABLE "Session" (
 "tokenHash" TEXT NOT NULL, "userId" UUID NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash"),
 CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
