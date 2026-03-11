import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TuyaModule } from './tuya/tuya.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TuyaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
