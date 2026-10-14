export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  email: string;
  name: string;
  phone?: string;
}
