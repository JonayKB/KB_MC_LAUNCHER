import { useEffect, useState } from "react";
import { open } from '@tauri-apps/plugin-shell';
import DiscordMarkdown from "./DiscordMarkdown";
import { fetchNews, NewsMessage, NewsPoll } from "../repositories/NewsRepository";
import { formatTimeAgo } from "../repositories/PlayHistory";
import { formatReleaseDate } from "../types/modpack";
import { news } from "../styles/newsStyles";

const REFRESH_MS = 5 * 60 * 1000;

function PollCard({ poll, url }: Readonly<{ poll: NewsPoll; url: string }>) {
    const total = poll.answers.reduce((sum, answer) => sum + answer.votes, 0);
    const closed = poll.finalized || (poll.expiresAt !== null && poll.expiresAt <= Date.now());
    const leading = Math.max(...poll.answers.map(answer => answer.votes));

    let status = 'Encuesta abierta';
    if (closed) status = 'Encuesta finalizada';
    else if (poll.expiresAt !== null) status = `Finaliza el ${formatReleaseDate(poll.expiresAt)}`;

    return (
        <div style={news.poll}>
            <span style={news.pollQuestion}>{poll.question}</span>
            {poll.answers.map((answer, i) => {
                const percent = total > 0 ? Math.round((answer.votes / total) * 100) : 0;
                const won = closed && total > 0 && answer.votes === leading;
                return (
                    <div key={`${i}-${answer.text}`} style={news.pollAnswer}>
                        <div style={news.pollBar(percent, won)} />
                        <span style={news.pollAnswerText(won)}>
                            {answer.emoji && `${answer.emoji} `}{answer.text}
                        </span>
                        <span style={news.pollVotes}>{answer.votes} · {percent}%</span>
                    </div>
                );
            })}
            <div style={news.pollFooter}>
                <span style={news.date}>
                    {total} {total === 1 ? 'voto' : 'votos'} · {status}
                </span>
                {!closed && (
                    <button style={news.pollVote} onClick={() => open(url).catch(console.error)}>
                        Votar en Discord
                    </button>
                )}
            </div>
        </div>
    );
}

function NewsItem({ message }: Readonly<{ message: NewsMessage }>) {
    return (
        <article style={news.message}>
            {message.authorAvatarUrl
                ? <img src={message.authorAvatarUrl} alt="" style={news.avatar} />
                : <div style={news.avatarFallback} />}
            <div style={news.body}>
                <div style={news.meta}>
                    <span style={news.author}>{message.authorName}</span>
                    <span style={news.date} title={new Date(message.createdAt).toLocaleString('es-ES')}>
                        {formatTimeAgo(message.createdAt)}
                    </span>
                    <button style={news.discordLink} onClick={() => open(message.url).catch(console.error)}>
                        Ver en Discord
                    </button>
                </div>
                {message.content && <DiscordMarkdown text={message.content} />}
                {message.poll && <PollCard poll={message.poll} url={message.url} />}
                {message.images.map(url => (
                    <img
                        key={url}
                        src={url}
                        alt=""
                        style={news.image}
                        // Si caduca el enlace, mejor sin imagen que con el icono roto
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                ))}
            </div>
        </article>
    );
}

/** Sin noticias no se muestra nada: un fallo aquí no debe molestar en la Home */
export default function NewsPanel() {
    const [messages, setMessages] = useState<NewsMessage[]>([]);

    useEffect(() => {
        const load = () => fetchNews().then(setMessages).catch(console.warn);
        load();
        // El launcher se queda abierto mucho tiempo en la Home
        const timer = window.setInterval(load, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, []);

    if (messages.length === 0) return null;

    return (
        <section style={news.panel}>
            <h2 style={news.panelTitle}>Noticias</h2>
            <div style={news.list}>
                {messages.map(message => <NewsItem key={message.id} message={message} />)}
            </div>
        </section>
    );
}
