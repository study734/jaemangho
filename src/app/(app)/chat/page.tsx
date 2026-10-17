import { ChatRoom } from '@/features/ai';
import { AI_DISABLED_MESSAGE } from '@/server/ai-status';

export default function ChatPage() { return <ChatRoom message={AI_DISABLED_MESSAGE} />; }
