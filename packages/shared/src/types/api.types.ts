export interface IPaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface IApiError {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
}

export interface ISortOptions {
  field: string;
  order: 'ASC' | 'DESC';
}
