import { ArticleProps } from "@/@types/article";
export interface AuthServiceProps {
  login: (email: string, password: string) => any;
  register: (
    email: string,
    username: string,
    password: string,
    captcha: string,
    captcha_id: number,
  ) => Promise<any>;
  resetPassword: (
    email: string,
    password: string,
    captcha: string,
  ) => Promise<any>;
  emailEval: (email: string, motive: 'register' | 'forget') => Promise<any>;
  isLogged: boolean;
  logout: () => void;
  setUserInfo: (userInfo: UserProps | null) => void;
  userInfo: UserProps | null;
  checkIsLogged: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
}

export interface UserProps {
  id?: number;
  username: string;
  about: string;
  avatar: string;
  email: string;
  date_joined: string;
  last_name: string;
  first_name: string;
  public_articles: ArticleProps[];
}
