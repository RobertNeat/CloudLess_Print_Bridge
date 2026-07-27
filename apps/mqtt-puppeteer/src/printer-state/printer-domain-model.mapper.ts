import type { PrinterDomainModelDto } from '@cloudless/printer-contracts';
import type { JsonObject } from '../common/json';

export const PRINTER_DOMAIN_MAPPER = Symbol('PRINTER_DOMAIN_MAPPER');

export interface PrinterDomainModelMapper {
  map(source: JsonObject): PrinterDomainModelDto;
}
