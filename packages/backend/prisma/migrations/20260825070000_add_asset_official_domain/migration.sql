-- Registrable domain of the issuer/protocol's official site; news from this
-- domain earns the Primary source badge for the asset.
ALTER TABLE "Asset" ADD COLUMN "officialDomain" TEXT;
