type CardBackArtworkProps = {
  className?: string;
  idPrefix: string;
};

export function CardBackArtwork({ className, idPrefix }: CardBackArtworkProps) {
  const clipId = `${idPrefix}-card-clip`;
  const dotsId = `${idPrefix}-halftone`;

  return <svg className={className} viewBox="0 0 280 400" role="img" aria-label="ONCHAIN PERSONA collectible card back">
    <defs>
      <clipPath id={clipId}>
        <rect x="12" y="12" width="256" height="376" rx="14" />
      </clipPath>
      <pattern id={dotsId} width="12" height="12" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.15" fill="#FFF9E9" opacity=".085" />
      </pattern>
    </defs>

    <rect x="2" y="2" width="276" height="396" rx="20" fill="#12285B" />
    <rect x="8" y="8" width="264" height="384" rx="16" fill="#F6C945" />
    <rect x="14" y="14" width="252" height="372" rx="13" fill="#F5E9CE" stroke="#12285B" strokeWidth="3" />
    <rect x="20" y="20" width="240" height="360" rx="11" fill="#2454C6" stroke="#12285B" strokeWidth="5" />
    <rect x="27" y="27" width="226" height="346" rx="8" fill="none" stroke="#F6C945" strokeWidth="3" />

    <g clipPath={`url(#${clipId})`}>
      <rect x="12" y="12" width="256" height="376" fill={`url(#${dotsId})`} />
      <path d="M20 92H260M20 308H260" stroke="#4D75DB" strokeWidth="28" opacity=".18" />
      <path d="M32 30L248 370M248 30L32 370" stroke="#FFF9E9" strokeWidth="1.5" opacity=".08" />
    </g>

    <g fill="none">
      <circle cx="140" cy="205" r="69" stroke="#F6C945" strokeWidth="5" />
      <circle cx="140" cy="205" r="105" stroke="#F6C945" strokeWidth="2" opacity=".9" />
      <path d="M42 174C72 82 207 73 235 169" stroke="#F6C945" strokeWidth="2" opacity=".82" />
      <path d="M47 279C81 342 195 337 230 279" stroke="#F6C945" strokeWidth="2" opacity=".74" />
    </g>

    <g aria-hidden="true" fill="#F6C945">
      <circle cx="140" cy="136" r="7" /><circle cx="140" cy="274" r="7" />
      <circle cx="71" cy="205" r="6" /><circle cx="209" cy="205" r="6" />
      <circle cx="91" cy="156" r="6" fill="#F5E9CE" /><circle cx="189" cy="156" r="6" fill="#F5E9CE" />
      <circle cx="91" cy="254" r="6" fill="#F5E9CE" /><circle cx="189" cy="254" r="6" fill="#F5E9CE" />
      <circle cx="54" cy="151" r="5" /><circle cx="226" cy="151" r="5" />
      <circle cx="65" cy="292" r="5" /><circle cx="215" cy="292" r="5" />
    </g>

    <path d="M140 132C147 171 164 191 204 205C164 219 147 239 140 278C133 239 116 219 76 205C116 191 133 171 140 132Z" fill="#F6C945" stroke="#12285B" strokeWidth="4" strokeLinejoin="round" />
    <path d="M140 160C144 183 155 197 177 205C155 213 144 227 140 250C136 227 125 213 103 205C125 197 136 183 140 160Z" fill="#FFF9E9" opacity=".55" />

    <g fill="#F6C945" stroke="#12285B" strokeWidth="2" strokeLinejoin="round">
      <path d="M140 35L146 54L160 60L146 66L140 85L134 66L120 60L134 54Z" />
      <path d="M140 315L146 334L160 340L146 346L140 365L134 346L120 340L134 334Z" />
      <path d="M49 109L53 121L63 125L53 129L49 141L45 129L35 125L45 121Z" />
      <path d="M231 269L235 281L245 285L235 289L231 301L227 289L217 285L227 281Z" />
    </g>

    <g fill="#F5E9CE" stroke="#F6C945" strokeWidth="3">
      <path d="M28 74V30H73C62 37 57 48 54 60C45 63 36 68 28 74Z" />
      <path d="M252 74V30H207C218 37 223 48 226 60C235 63 244 68 252 74Z" />
      <path d="M28 326V370H73C62 363 57 352 54 340C45 337 36 332 28 326Z" />
      <path d="M252 326V370H207C218 363 223 352 226 340C235 337 244 332 252 326Z" />
    </g>
    <g fill="#2454C6">
      <path d="M46 38L49 47L57 50L49 53L46 62L43 53L35 50L43 47Z" />
      <path d="M234 38L237 47L245 50L237 53L234 62L231 53L223 50L231 47Z" />
      <path d="M46 338L49 347L57 350L49 353L46 362L43 353L35 350L43 347Z" />
      <path d="M234 338L237 347L245 350L237 353L234 362L231 353L223 350L231 347Z" />
    </g>
  </svg>;
}
