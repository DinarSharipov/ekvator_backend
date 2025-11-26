import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Global()
@Module({
  providers: [
    {
      provide: 'PG_POOL',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Pool({
          host: config.get<string>('DB_HOST', 'db'),
          port: parseInt(config.get<string>('DB_PORT', '5432'), 10),
          user: config.get<string>('DB_USER', 'postgres'),
          password: config.get<string>('DB_PASSWORD', 'postgres'),
          database: config.get<string>('DB_NAME', 'ekvator'),
        });
      },
    },
  ],
  exports: ['PG_POOL'],
})
export class DatabaseModule {}
