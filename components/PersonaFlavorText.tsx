export function PersonaFlavorText({ lines }: { lines: string[] }) {
  return <blockquote className="persona-flavor-text">
    <span className="persona-flavor-text__spark" aria-hidden="true">✦</span>
    <p>{lines.map((line) => <span key={line}>{line}</span>)}</p>
  </blockquote>;
}
