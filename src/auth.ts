import { createContext } from 'react';

export interface Me {
  id: string;
  name: string;
  isAdmin: boolean;
}

// 배포 환경에서 로그인한 사용자. 로컬 개발(로그인 없음)에서는 null.
export const MeContext = createContext<Me | null>(null);
