import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { MovementController } from './movement.controller';

@Module({
  imports: [CommandsModule],
  controllers: [MovementController],
})
export class MovementModule {}
