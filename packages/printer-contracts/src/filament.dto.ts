export interface FilamentTypeDefinitionDto {
  id: string;
  displayName: string;
  trayType: string;
  defaultTrayColor: string;
  nozzleTemperatureMin: number;
  nozzleTemperatureMax: number;
}

export interface FilamentMetaTypeDefinitionDto {
  id: string;
  filamentTypeId: string;
  filamentBrand: string;
  trayInfoIdx: string;
  nozzleTemperatureMinOverride?: number;
  nozzleTemperatureMaxOverride?: number;
}

export interface ResolvedFilamentDefinitionDto {
  id: string;
  displayName: string;
  filamentTypeId: string;
  filamentBrand: string;
  trayInfoIdx: string;
  trayType: string;
  trayColor: string;
  nozzleTemperatureMin: number;
  nozzleTemperatureMax: number;
}

export interface FilamentCatalogDto {
  types: FilamentTypeDefinitionDto[];
  metaTypes: FilamentMetaTypeDefinitionDto[];
  resolved: ResolvedFilamentDefinitionDto[];
}
