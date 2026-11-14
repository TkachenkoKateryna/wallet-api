import { Module } from '@nestjs/common';
import { LedgerRepository } from './ledger.repository.js';
import { PostingService } from './posting.service.js';

@Module({
  providers: [LedgerRepository, PostingService],
  exports: [PostingService],
})
export class LedgerModule {}
