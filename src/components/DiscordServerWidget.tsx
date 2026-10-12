export function DiscordServerWidget() {
  return (
    <section className="discord-server-widget" aria-labelledby="discord-server-title">
      <h2 id="discord-server-title">재망호 디스코드 서버</h2>
      <iframe
        title="재망호 디스코드 서버 위젯"
        src="https://discord.com/widget?id=742002842453409792&theme=dark"
        width="350"
        height="500"
        loading="lazy"
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      />
      <p>위젯이 표시되지 않으면 <a href="https://discord.com/channels/742002842453409792" target="_blank" rel="noopener noreferrer">디스코드에서 서버 열기</a></p>
    </section>
  );
}
