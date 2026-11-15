-- Существующие задачи сохраняют NULL: время их создания неизвестно.
ALTER TABLE "Todo" ADD COLUMN "createdAt" TIMESTAMPTZ(3);
ALTER TABLE "Todo" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
