export enum UserRole {
  OPERATOR = 'operator',
  ADMIN = 'admin',
}

export interface IUser {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  role: UserRole;
  isApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateUser {
  fullName: string;
  phone: string;
  email: string;
  password: string;
}

export interface ILoginRequest {
  phoneOrEmail: string;
  password: string;
}

export type TokenType = 'access' | 'refresh';

export interface ITokenPayload {
  sub: string;
  role: UserRole;
  /** Missing on tokens issued before access/refresh were split. */
  typ?: TokenType;
}

export interface IAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ILoginResponse extends IAuthTokens {
  user: IUser;
}
