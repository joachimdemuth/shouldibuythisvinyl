import { CONDITIONS, SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/types";

export const conditionLabels: Record<(typeof CONDITIONS)[number], string> = {
  sealed: "Sealed",
  mint: "Mint (M)",
  near_mint: "Near Mint (NM/NM-)",
  very_good_plus: "Very Good Plus (VG+)",
  very_good: "Very Good (VG)",
  good: "Good (G)",
  fair: "Fair (F)",
  poor: "Poor (P)",
};

export const currencyLabels: Record<SupportedCurrency, string> = {
  USD: "USD - US Dollar",
  EUR: "EUR - Euro",
  GBP: "GBP - British Pound",
  SEK: "SEK - Swedish Krona",
  NOK: "NOK - Norwegian Krone",
  DKK: "DKK - Danish Krone",
  CAD: "CAD - Canadian Dollar",
  AUD: "AUD - Australian Dollar",
  JPY: "JPY - Japanese Yen",
};

export { CONDITIONS, SUPPORTED_CURRENCIES };
