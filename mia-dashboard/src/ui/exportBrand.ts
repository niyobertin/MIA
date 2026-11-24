import { createContext, useContext } from 'react';

export type ExportBrand = { businessName: string; currency: string };

export const ExportBrandContext = createContext<ExportBrand>({ businessName: 'MIA', currency: 'RWF' });

export function useExportBrand() {
  return useContext(ExportBrandContext);
}
