import { Injectable } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { env } from "prisma/config";
import { PrismaClient } from "../../prisma/generated/prisma/client";
@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: env("DATABASE_URL"),
    });
    super({ adapter });
  }
}

