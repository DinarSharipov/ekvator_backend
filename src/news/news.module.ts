import { Module } from "@nestjs/common";
import { NewsController } from "./news.controller";
import { NewsService, NewsRuntime } from "./news.service";

@Module({ controllers: [NewsController], providers: [NewsRuntime, NewsService] })
export class NewsModule {}
