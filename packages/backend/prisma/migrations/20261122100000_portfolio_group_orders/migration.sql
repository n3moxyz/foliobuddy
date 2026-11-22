CREATE TABLE "PortfolioGroupOrder" (
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "order" TEXT[] NOT NULL,
    CONSTRAINT "PortfolioGroupOrder_pkey" PRIMARY KEY ("userId", "scope"),
    CONSTRAINT "PortfolioGroupOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
