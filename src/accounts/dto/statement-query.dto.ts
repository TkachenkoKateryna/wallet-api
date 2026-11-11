import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  STATEMENT_DEFAULT_LIMIT,
  STATEMENT_MAX_LIMIT,
} from '../accounts.constants.js';

export class StatementQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STATEMENT_MAX_LIMIT)
  limit: number = STATEMENT_DEFAULT_LIMIT;

  // Opaque value from a previous page's next_cursor
  @IsOptional()
  @IsString()
  cursor?: string;
}
