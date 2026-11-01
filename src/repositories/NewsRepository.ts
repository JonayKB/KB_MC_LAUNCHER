import { invoke } from '@tauri-apps/api/core';

/** Lo publica KB_Discord_Bot; el token de Discord nunca llega al launcher */
const NEWS_URL = 'https://discord.jonaykb.com/news/latest.json';
const NEWS_FORMAT_VERSION = 1;
const MAX_MESSAGES = 5;

export interface NewsPollAnswer {
    text: string;
    emoji: string | null;
    votes: number;
}

export interface NewsPoll {
    question: string;
    answers: NewsPollAnswer[];
    expiresAt: number | null;
    finalized: boolean;
}

export interface NewsMessage {
    id: string;
    authorName: string;
    authorAvatarUrl: string | null;
    /** Texto plano: el bot ya ha resuelto menciones, emojis y markdown */
    content: string;
    createdAt: number;
    /** Enlace al mensaje en Discord */
    url: string;
    images: string[];
    poll: NewsPoll | null;
}

function isHttpsUrl(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

function parsePollAnswer(raw: any): NewsPollAnswer | null {
    if (typeof raw?.text !== 'string' || raw.text.trim() === '') return null;
    return {
        text: raw.text,
        emoji: typeof raw.emoji === 'string' && raw.emoji !== '' ? raw.emoji : null,
        votes: Number.isInteger(raw.votes) && raw.votes > 0 ? raw.votes : 0,
    };
}

function parsePoll(raw: any): NewsPoll | null {
    if (typeof raw?.question !== 'string' || raw.question.trim() === '' || !Array.isArray(raw.answers)) return null;
    const answers = raw.answers
        .map(parsePollAnswer)
        .filter((answer: NewsPollAnswer | null): answer is NewsPollAnswer => answer !== null);
    if (answers.length === 0) return null;
    const expiresAt = Date.parse(raw.expiresAt);
    return {
        question: raw.question,
        answers,
        expiresAt: Number.isNaN(expiresAt) ? null : expiresAt,
        finalized: raw.finalized === true,
    };
}

function parseMessage(raw: any): NewsMessage | null {
    const createdAt = Date.parse(raw?.createdAt);
    const content = typeof raw?.content === 'string' ? raw.content.trim() : '';
    const images: string[] = Array.isArray(raw?.images)
        ? raw.images.map((image: any) => image?.url).filter(isHttpsUrl)
        : [];
    const poll = parsePoll(raw?.poll);
    const valid = typeof raw?.id === 'string'
        && typeof raw?.author?.name === 'string'
        && isHttpsUrl(raw?.url)
        && !Number.isNaN(createdAt)
        && (content !== '' || images.length > 0 || poll !== null);
    if (!valid) return null;
    return {
        id: raw.id,
        authorName: raw.author.name,
        authorAvatarUrl: isHttpsUrl(raw.author.avatarUrl) ? raw.author.avatarUrl : null,
        content,
        createdAt,
        url: raw.url,
        images,
        poll,
    };
}

/** Descarta lo que no entienda: un mensaje mal formado no debe romper la Home */
export function parseNewsFeed(raw: string): NewsMessage[] {
    const feed = JSON.parse(raw);
    if (feed?.version !== NEWS_FORMAT_VERSION || !Array.isArray(feed.messages)) {
        throw new Error('Formato de noticias no compatible');
    }
    return feed.messages
        .map(parseMessage)
        .filter((message: NewsMessage | null): message is NewsMessage => message !== null)
        .sort((a: NewsMessage, b: NewsMessage) => b.createdAt - a.createdAt)
        .slice(0, MAX_MESSAGES);
}

export async function fetchNews(): Promise<NewsMessage[]> {
    return parseNewsFeed(await invoke<string>('fetch_text', { url: NEWS_URL }));
}
