-- 웃음 집계는 각 메시지 뒤 2분의 같은 채널을 찾는다. 웃음이 없는 메시지는 합계에 기여하지 않는다.
create index chat_messages_laugh_channel_time on chat_messages (channel_id, created_at) include (author_id, laugh) where laugh > 0;
create index chat_messages_laugh_time on chat_messages (created_at desc) where laugh > 0;
