import { ChatRoom } from '@/features/ai';
import { aiKeyConfigured } from '@/server/ai/client';

// 키 유무는 요청 때 읽는다(배포 때 굳히지 않는다).
export const dynamic = 'force-dynamic';

export default function ChatPage() { return <ChatRoom unavailable={!aiKeyConfigured()} />; }
