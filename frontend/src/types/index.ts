export interface Product {
  asin: string;
  productName: string;
  brand: string;
  usPrice: number;
  jpPrice: number;
  usSellerCount: number;
  profitJpy?: number;
  profitRate?: number;
  isExcluded?: boolean;
}

export interface ResearchLog {
  id: string;
  createdAt: string;
  searchType: string;
  query: string;
  classification?: {
    id: string;
    name: string;
  };
  resultCount: number;
}

export interface AppSettings {
  domesticShippingCostPerItem: number;
  customsDutyRate: number;
  amazonFeeRate: number;
  exchangeRateJpyToUsd: number;
  inventoryThreshold: number;
  excludedAsins: string[];
  excludedBrands: string[];
  excludedKeywords: string[];
  profitabilityTiers: ProfitabilityTier[];
  shippingCostTiers: ShippingCostTier[];
}

export interface ProfitabilityTier {
  fromPrice: number;
  toPrice: number;
  minProfitRate: number;
  minProfitAmount: number;
}

export interface ShippingCostTier {
  fromWeight: number;
  toWeight: number;
  cost: number;
}
