'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createChatModel } from './model';

const ChatContext = createContext<{ model: ReturnType<typeof createChatModel>; userName: string } | null>(null);

// Layout-owned memory survives client navigation, and is discarded on reload or logout.
export function ChatProvider({ children, userName }: { children: ReactNode; userName: string }) {
  const [value] = useState(() => ({ model: createChatModel(), userName }));
  useEffect(() => () => value.model.cancel(), [value]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error('재순이 대화는 ChatProvider 안에서 사용합니다.');
  const snapshot = useSyncExternalStore(value.model.subscribe, value.model.getSnapshot, value.model.getServerSnapshot);
  return { ...value, ...snapshot };
}
