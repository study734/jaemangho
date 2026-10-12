'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const styles = { placeholder: { height: 500 } };

export function DiscordServerWidget() {
  // HTML filters can remove server-rendered iframes before hydration.
  // Keep the server and hydration markup identical, then create the frame.
  const ready = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  return (
    <section className="discord-server-widget" aria-labelledby="discord-server-title">
      <h2 id="discord-server-title">재망호 디스코드 서버</h2>
      {ready ? (
        <iframe
          title="재망호 디스코드 서버 위젯"
          src="https://discord.com/widget?id=742002842453409792&theme=dark"
          width="350"
          height="500"
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        />
      ) : <div style={styles.placeholder} aria-hidden="true" />}
      <p>위젯이 표시되지 않으면 <a href="https://discord.com/channels/742002842453409792" target="_blank" rel="noopener noreferrer">디스코드에서 서버 열기</a></p>
    </section>
  );
}
