export interface Product {
  asin: string;
  productName: string;
  brand: string;
  usPrice: number;
  jpPrice: number;
  usSellerCount: number;
  jpSellerCount?: number;
  profitJpy?: number;
  profitRate?: number;
  isExcluded?: boolean;
  productType?: string;
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
  internationalShippingFscRate: number;
  internationalShippingFixedFeeJpy: number;
  customsDutyRate: number;
  amazonFeeRate: number;
  exchangeRateJpyToUsd: number;
  autoExchangeRateEnabled: boolean;
  exchangeRateRefreshIntervalMinutes: number;
  exchangeRateUpdatedAt?: string | null;
  exchangeRateDate?: string | null;
  exchangeRateSource?: string | null;
  inventoryThreshold: number;
  leadTimeBuffer: number;
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
