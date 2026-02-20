export interface Subcategory {
  id: string;
  name: string;
  keywords?: string[];
}

export interface Category {
  id: string;
  name: string;
  subcategories?: Subcategory[];
  keywords?: string[];
}
