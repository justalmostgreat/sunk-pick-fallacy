// Glue each emoji run to the word before it, so a line never starts with a lone emoji.
const run = /(\S+\s(?:\p{Extended_Pictographic}️?)+)/u;

export function Ink({ text }: { text: string }) {
  return text.split(run).map((part, i) => i % 2 ? <span key={i} className="whitespace-nowrap">{part}</span> : part);
}
