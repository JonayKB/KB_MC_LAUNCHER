import { ReactNode, useState } from "react";
import { open } from '@tauri-apps/plugin-shell';
import { news } from "../styles/newsStyles";

/**
 * Markdown de Discord, que no es CommonMark (`-#`, `||spoiler||`, `__subrayado__`...).
 * Genera solo elementos React: el texto del canal nunca se interpreta como HTML.
 */

type Block =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'subtext'; text: string }
    | { type: 'quote'; text: string }
    | { type: 'list'; start: number | null; items: string[] }
    | { type: 'code'; text: string }
    | { type: 'paragraph'; text: string };

const CODE_FENCE = /```(?:[\w+-]*\n)?([\s\S]*?)```/g;
const BULLET = /^\s*[-*] +(.+)$/;
const NUMBERED = /^\s*(\d+)\. +(.+)$/;
const HEADING = /^(#{1,3}) +(.+)$/;
const SUBTEXT = /^-# +(.+)$/;
const QUOTE = /^> ?(.*)$/;

const isParagraphLine = (line: string) =>
    line.trim() !== '' && ![BULLET, NUMBERED, HEADING, SUBTEXT, QUOTE].some(re => re.test(line)) && !line.startsWith('>>>');

function parseTextBlocks(text: string): Block[] {
    const blocks: Block[] = [];
    const lines = text.split('\n');
    let i = 0;

    const takeWhile = (test: (line: string) => boolean) => {
        const taken: string[] = [];
        while (i < lines.length && test(lines[i])) taken.push(lines[i++]);
        return taken;
    };

    while (i < lines.length) {
        const line = lines[i];
        const heading = HEADING.exec(line);
        const subtext = SUBTEXT.exec(line);
        if (line.trim() === '') {
            i++;
        } else if (heading) {
            blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
            i++;
        } else if (subtext) {
            blocks.push({ type: 'subtext', text: subtext[1] });
            i++;
        } else if (line.startsWith('>>>')) {
            // >>> cita todo lo que queda
            blocks.push({ type: 'quote', text: lines.slice(i).join('\n').replace(/^>>> ?/, '') });
            break;
        } else if (QUOTE.test(line)) {
            const quoted = takeWhile(l => QUOTE.test(l)).map(l => QUOTE.exec(l)![1]);
            blocks.push({ type: 'quote', text: quoted.join('\n') });
        } else if (BULLET.test(line)) {
            blocks.push({ type: 'list', start: null, items: takeWhile(l => BULLET.test(l)).map(l => BULLET.exec(l)![1]) });
        } else if (NUMBERED.test(line)) {
            const start = Number(NUMBERED.exec(line)![1]);
            blocks.push({ type: 'list', start, items: takeWhile(l => NUMBERED.test(l)).map(l => NUMBERED.exec(l)![2]) });
        } else {
            blocks.push({ type: 'paragraph', text: takeWhile(isParagraphLine).join('\n') });
        }
    }
    return blocks;
}

export function parseBlocks(text: string): Block[] {
    const blocks: Block[] = [];
    let last = 0;
    for (const match of text.matchAll(CODE_FENCE)) {
        blocks.push(...parseTextBlocks(text.slice(last, match.index)));
        blocks.push({ type: 'code', text: match[1].replace(/\n$/, '') });
        last = match.index + match[0].length;
    }
    blocks.push(...parseTextBlocks(text.slice(last)));
    return blocks;
}

const INLINE_SOURCE = [
    String.raw`\\(?<escaped>[^\w\s])`,
    '`(?<code>[^`\\n]+)`',
    String.raw`\|\|(?<spoiler>[\s\S]+?)\|\|`,
    // Como en Discord, el cierre admite un espacio antes: **negrita **
    String.raw`\*\*\*(?=\S)(?<boldItalic>[\s\S]+?)\*\*\*`,
    String.raw`\*\*(?=\S)(?<bold>[\s\S]+?)\*\*`,
    String.raw`__(?=\S)(?<underline>[\s\S]+?)__`,
    String.raw`~~(?=\S)(?<strike>[\s\S]+?)~~`,
    String.raw`\*(?=[^\s*])(?<italic>[^*\n]*?[^\s*])\*`,
    String.raw`_(?=[^\s_])(?<underscored>[^_\n]*?[^\s_])_(?![\p{L}\p{N}_])`,
    String.raw`\[(?<label>[^\]\n]+)\]\((?<href>https?:\/\/[^\s)]+)\)`,
    String.raw`<(?<angled>https?:\/\/[^\s>]+)>`,
    String.raw`(?<bare>https?:\/\/[^\s<>]+)`,
].join('|');

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function ExternalLink({ url, children }: Readonly<{ url: string; children: ReactNode }>) {
    return (
        <a
            href={url}
            style={news.inlineLink}
            onClick={(e) => {
                e.preventDefault();
                open(url).catch(console.error);
            }}
        >
            {children}
        </a>
    );
}

function Spoiler({ children }: Readonly<{ children: ReactNode }>) {
    const [revealed, setRevealed] = useState(false);
    return (
        <span
            style={news.spoiler(revealed)}
            title={revealed ? undefined : 'Mostrar spoiler'}
            onClick={() => setRevealed(true)}
        >
            {children}
        </span>
    );
}

function renderMatch(g: Record<string, string | undefined>): ReactNode {
    if (g.escaped !== undefined) return g.escaped;
    if (g.code !== undefined) return <code style={news.inlineCode}>{g.code}</code>;
    if (g.spoiler !== undefined) return <Spoiler>{renderInline(g.spoiler)}</Spoiler>;
    if (g.boldItalic !== undefined) return <strong><em>{renderInline(g.boldItalic)}</em></strong>;
    if (g.bold !== undefined) return <strong>{renderInline(g.bold)}</strong>;
    if (g.underline !== undefined) return <u>{renderInline(g.underline)}</u>;
    if (g.strike !== undefined) return <s>{renderInline(g.strike)}</s>;
    if (g.italic !== undefined) return <em>{renderInline(g.italic)}</em>;
    if (g.underscored !== undefined) return <em>{renderInline(g.underscored)}</em>;
    if (g.label !== undefined) return <ExternalLink url={g.href!}>{renderInline(g.label)}</ExternalLink>;
    if (g.angled !== undefined) return <ExternalLink url={g.angled}>{g.angled}</ExternalLink>;
    const url = g.bare!.replace(/[.,;:!?)\]]+$/, '');
    return <><ExternalLink url={url}>{url}</ExternalLink>{g.bare!.slice(url.length)}</>;
}

function renderInline(text: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    const re = new RegExp(INLINE_SOURCE, 'gu');
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const g = match.groups!;
        // Sin lookbehind en la regex: un literal no soportado rompería todo el bundle en WebKit antiguo
        if (g.underscored !== undefined && match.index > 0 && WORD_CHAR.test(text[match.index - 1])) {
            re.lastIndex = match.index + 1;
            continue;
        }
        if (match.index > last) nodes.push(text.slice(last, match.index));
        nodes.push(<span key={match.index}>{renderMatch(g)}</span>);
        last = re.lastIndex;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

function BlockView({ block }: Readonly<{ block: Block }>) {
    switch (block.type) {
        case 'heading': {
            const Tag = `h${block.level + 2}` as 'h3' | 'h4' | 'h5';
            return <Tag style={news.heading(block.level)}>{renderInline(block.text)}</Tag>;
        }
        case 'subtext':
            return <small style={news.subtext}>{renderInline(block.text)}</small>;
        case 'quote':
            return <blockquote style={news.quote}><DiscordMarkdown text={block.text} /></blockquote>;
        case 'list': {
            const items = block.items.map((item, i) => <li key={`${i}-${item}`}>{renderInline(item)}</li>);
            return block.start === null
                ? <ul style={news.bulletList}>{items}</ul>
                : <ol style={news.bulletList} start={block.start}>{items}</ol>;
        }
        case 'code':
            return <pre style={news.codeBlock}>{block.text}</pre>;
        case 'paragraph':
            return <p style={news.content}>{renderInline(block.text)}</p>;
    }
}

export default function DiscordMarkdown({ text }: Readonly<{ text: string }>) {
    return (
        <div style={news.markdown}>
            {parseBlocks(text).map((block, i) => <BlockView key={`${i}-${block.type}`} block={block} />)}
        </div>
    );
}
