import { and, eq } from 'drizzle-orm';
import { portfolios } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import type { CreatePortfolio } from '@investorkit/shared';
// Caller must obtain ownerId from the validated server session.
export function portfolioRepository(db: Database) {
  return {
    list: (ownerId: string) => db.select().from(portfolios).where(eq(portfolios.ownerId, ownerId)),
    async find(ownerId: string, id: string) {
      const [row] = await db.select().from(portfolios).where(and(eq(portfolios.ownerId, ownerId), eq(portfolios.id, id)));
      return row;
    },
    async create(ownerId: string, input: CreatePortfolio) {
      const [row] = await db.insert(portfolios).values({ ownerId, ...input }).returning();
      if (!row) throw new Error('Portfolio insert returned no row');
      return row;
    },
  };
}
