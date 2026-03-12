export interface IBox {
  id: string;
  boxNumber: string;
  description: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateBox {
  boxNumber: string;
  description?: string;
}
