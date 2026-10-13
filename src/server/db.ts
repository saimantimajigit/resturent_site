import 'server-only';import {PrismaClient} from '../generated/prisma/client';import {PrismaPg} from '@prisma/adapter-pg';
const globalDb=globalThis as unknown as {savorePrisma?:PrismaClient};
export const db=globalDb.savorePrisma??new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
if(process.env.NODE_ENV!=='production')globalDb.savorePrisma=db;
