import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { FilamentOperationsController } from './filament-operations.controller';

@Module({
  imports: [CommandsModule],
  controllers: [FilamentOperationsController],
})
export class FilamentOperationsModule {}
