export function Art() {
  const lines = Array.from({ length: 12 }, (_, i) => {
    const y = 170 + i * 50
    return `M-120 ${y} C 260 ${y - 230}, 620 ${y + 250}, 980 ${y - 30} S 1400 ${y - 170}, 1600 ${y + 60}`
  })
  return (<>
    <div className="fx" aria-hidden="true">
      <i className="blob b1" /><i className="blob b2" /><i className="blob b3" />
      {Array.from({ length: 16 }, (_, i) => (
        <i key={i} className={'spark' + (i % 4 === 0 ? ' gold' : '')}
          style={{ '--x': ((i * 37 + 11) % 100) + '%', '--s': 2 + (i % 3) + 'px', '--d': 16 + ((i * 7) % 14) + 's',
            '--t': -((i * 5) % 20) + 's', '--dx': (i % 2 ? 40 : -40) + 'px' }} />
      ))}
    </div>
    <svg className="art" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="lg-fade" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="lg-mask"><rect width="1440" height="900" fill="url(#lg-fade)" /></mask>
        <pattern id="lg-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="currentColor" /></pattern>
        <linearGradient id="lg-gold" x1="0" x2="1"><stop offset="0" stopColor="var(--chalk)" stopOpacity="0" /><stop offset=".5" stopColor="var(--chalk)" /><stop offset="1" stopColor="var(--chalk)" stopOpacity="0" /></linearGradient>
      </defs>
      <g className="sway" mask="url(#lg-mask)" fill="none" stroke="currentColor">
        {lines.map((d, i) => <path key={i} d={d} strokeOpacity={0.05 + i * 0.013} strokeWidth="1" />)}
      </g>
      <path d={lines[6]} fill="none" stroke="url(#lg-gold)" strokeWidth="1.6" strokeOpacity=".75" />
      {[2, 6, 9].map((n, i) => (
        <path key={n} className="streak" d={lines[n]} pathLength="1000" stroke={i === 1 ? 'var(--chalk)' : 'currentColor'}
          style={{ animationDuration: 9 + i * 3 + 's', animationDelay: -i * 4 + 's' }} />
      ))}
      <g fill="none" stroke="currentColor" strokeOpacity=".09">
        {[90, 160, 235, 320].map((r, i) => <circle key={r} className="ring" cx="1190" cy="180" r={r} style={{ animationDelay: -i * 1.6 + 's' }} />)}
      </g>
      <circle cx="1190" cy="180" r="6" fill="var(--chalk)" />
      <g className="orbit"><circle cx="1425" cy="180" r="4.5" fill="var(--chalk)" /></g>
      <g className="orbit rev"><circle cx="1350" cy="180" r="3.5" fill="currentColor" fillOpacity=".85" /></g>
      <rect x="0" y="540" width="460" height="360" fill="url(#lg-dots)" opacity=".16" mask="url(#lg-mask)" />
      <path className="tri" d="M0 900 L300 600 L600 900 Z" fill="currentColor" fillOpacity=".025" />
      <path className="tri b" d="M180 900 L520 520 L860 900 Z" fill="var(--chalk)" fillOpacity=".04" />
    </svg>
  </>)
}
