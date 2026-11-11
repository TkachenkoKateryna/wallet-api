import { IsIn } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '../accounts.constants.js';
import type { Currency } from '../accounts.constants.js';

export class CreateAccountDto {
  @IsIn(SUPPORTED_CURRENCIES)
  currency: Currency;
}
