export interface Household {
  id: string;
  name: string;
  defaultSavingsTarget?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
