// Test double for @/lib/server/payment-banks — a receiving account that only
// exists inside the test run, so no customer ever sees it.
export interface BankForPayment {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_default: boolean;
}
export async function listPaymentBanks(): Promise<BankForPayment[]> {
  return [
    { id: "e2e-bank", bank_name: "KBank", account_number: "123-4-56789-0", account_name: "บจก. อีซี่สเปซ", is_default: true },
    { id: "e2e-placeholder", bank_name: "KBank", account_number: "000-0-00000-0", account_name: "Sample", is_default: false },
  ];
}
