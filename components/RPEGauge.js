import { useState } from 'react'

// ── Zones de fatigue ─────────────────────────────────────────
const ZONES = [
  { min: 1, max: 2.99, label: 'Très reposé',       color: '#22C55E' },
  { min: 3, max: 4.99, label: 'Bien récupéré',      color: '#84CC16' },
  { min: 5, max: 6.99, label: 'Légèrement fatigué', color: '#EAB308' },
  { min: 7, max: 8.99, label: 'Fatigué',            color: '#F97316' },
  { min: 9, max: 10,   label: 'Épuisé',             color: '#EF4444' },
]

function getZone(rpe) {
  return ZONES.find(z => rpe >= z.min && rpe <= z.max) || ZONES[2]
}

// ── Géométrie de la jauge ────────────────────────────────────
const CX = 160, CY = 140, R_OUTER = 120, R_INNER = 80
const NEEDLE_R = 110

function rpeToAngle(rpe) {
  // π (gauche, RPE=1) → 0 (droite, RPE=10)
  return Math.PI - ((rpe - 1) / 9) * Math.PI
}

function polar(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) }
}

function arcPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const os = polar(cx, cy, rOuter, startAngle)
  const oe = polar(cx, cy, rOuter, endAngle)
  const is = polar(cx, cy, rInner, endAngle)
  const ie = polar(cx, cy, rInner, startAngle)
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  return [
    `M ${os.x} ${os.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${oe.x} ${oe.y}`,
    `L ${is.x} ${is.y}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${ie.x} ${ie.y}`,
    'Z',
  ].join(' ')
}

// Tick marks on gauge
function tickPath(cx, cy, rOuter, rInner, angle) {
  const o = polar(cx, cy, rOuter, angle)
  const i = polar(cx, cy, rInner, angle)
  return `M ${o.x} ${o.y} L ${i.x} ${i.y}`
}

// ── Sous-composant: Jauge SVG ─────────────────────────────────
function GaugeSVG({ avg }) {
  const zone = getZone(avg)
  const needleAngle = rpeToAngle(avg)
  const needleTip = polar(CX, CY, NEEDLE_R, needleAngle)
  const needleBase1 = polar(CX, CY, 10, needleAngle + Math.PI / 2)
  const needleBase2 = polar(CX, CY, 10, needleAngle - Math.PI / 2)

  return (
    <svg viewBox="0 0 320 170" style={{ width: '100%', maxWidth: 320, display: 'block', margin: '0 auto' }}>
      {/* Arcs de zone */}
      {ZONES.map((z, i) => {
        const startAngle = rpeToAngle(Math.min(z.max, 10))
        const endAngle   = rpeToAngle(Math.max(z.min, 1))
        return (
          <path
            key={i}
            d={arcPath(CX, CY, R_OUTER, R_INNER, startAngle, endAngle)}
            fill={z.color}
            opacity={0.85}
          />
        )
      })}

      {/* Ticks */}
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => {
        const angle = rpeToAngle(v)
        return (
          <path
            key={v}
            d={tickPath(CX, CY, R_OUTER + 2, R_INNER - 2, angle)}
            stroke="white"
            strokeWidth={v % 5 === 0 ? 2.5 : 1}
            opacity={0.6}
          />
        )
      })}

      {/* Labels RPE 1 / 5 / 10 */}
      {[1, 5, 10].map(v => {
        const angle = rpeToAngle(v)
        const p = polar(CX, CY, R_OUTER + 16, angle)
        return (
          <text key={v} x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fill="#6B7069" fontFamily="system-ui">
            {v}
          </text>
        )
      })}

      {/* Aiguille */}
      <polygon
        points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
        fill="#3C3C3C"
        opacity={0.92}
      />
      <circle cx={CX} cy={CY} r={10} fill="#3C3C3C" />
      <circle cx={CX} cy={CY} r={5} fill="white" />

      {/* Valeur centrale */}
      <text x={CX} y={CY + 30} textAnchor="middle" fontSize={32} fontWeight={800} fill={zone.color} fontFamily="system-ui">
        {avg.toFixed(1)}
      </text>
      <text x={CX} y={CY + 48} textAnchor="middle" fontSize={11} fill="#6B7069" fontFamily="system-ui">
        RPE moyen d'équipe
      </text>
    </svg>
  )
}

// ── Composant principal ───────────────────────────────────────
/**
 * RPEGauge — affiche la jauge d'équipe + barres individuelles
 *
 * Props:
 *   rpeData       : [{athleteId, name, rpe}]  — athlètes ayant soumis
 *   totalAthletes : number                     — nb total dans l'équipe
 *   prevWeekAvg   : number | null              — RPE moyen semaine précédente
 *   weekLabel     : string                     — ex. "25 août – 31 août"
 *   loading       : bool
 */
export default function RPEGauge({ rpeData = [], totalAthletes = 0, prevWeekAvg = null, weekLabel = '', loading = false }) {
  const [hoveredIdx, setHoveredIdx] = useState(null)

  const submitted = rpeData.length
  const avg = submitted > 0
    ? rpeData.reduce((s, d) => s + d.rpe, 0) / submitted
    : 0

  const zone = getZone(avg)
  const trend = prevWeekAvg != null && submitted > 0 ? avg - prevWeekAvg : null
  const trendLabel = trend == null ? '—' : (trend > 0 ? `+${trend.toFixed(1)}` : trend.toFixed(1))
  const trendColor = trend == null ? '#9A9D94' : trend <= 0 ? '#22C55E' : trend <= 1 ? '#EAB308' : '#EF4444'

  // Tri : plus haut RPE en premier (plus fatigué)
  const sorted = [...rpeData].sort((a, b) => b.rpe - a.rpe)

  return (
    <div>
      {/* En-tête semaine */}
      {weekLabel && (
        <div style={{ fontSize: '0.82rem', color: '#6B7069', marginBottom: 14 }}>
          Semaine du <strong>{weekLabel}</strong>
        </div>
      )}

      {loading && (
        <p style={{ color: '#888', padding: '20px 0' }}>Chargement du RPE…</p>
      )}

      {!loading && submitted === 0 && (
        <div style={{
          background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10,
          padding: '24px', textAlign: 'center', color: '#9ca3af',
        }}>
          Aucune donnée RPE pour cette semaine.<br />
          <span style={{ fontSize: '0.82rem' }}>Les athlètes doivent compléter leur journal de bord.</span>
        </div>
      )}

      {!loading && submitted > 0 && (
        <>
          {/* Badge soumissions */}
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: '#f0f7e6', border: '1px solid #C5D400', borderRadius: 20,
              padding: '4px 14px', fontSize: '0.82rem', fontWeight: 700, color: '#3C3C3C',
            }}>
              {submitted}/{totalAthletes} athlètes ont soumis
            </span>
            {submitted < totalAthletes && (
              <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic' }}>
                {totalAthletes - submitted} sans réponse
              </span>
            )}
          </div>

          {/* Grille : jauge + barres */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
            {/* Jauge */}
            <div style={{ background: '#fff', border: '1px solid #DDE0D8', borderRadius: 12, padding: '20px 16px' }}>
              <GaugeSVG avg={avg} />

              {/* Tuiles stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#F7F8F4', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.68rem', color: '#6B7069', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Moy. équipe</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: zone.color }}>{avg.toFixed(1)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#F7F8F4', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.68rem', color: '#6B7069', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>vs sem. préc.</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: trendColor }}>{trendLabel}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#F7F8F4', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.68rem', color: '#6B7069', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Niveau</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: zone.color, marginTop: 4 }}>{zone.label}</div>
                </div>
              </div>
            </div>

            {/* Barres individuelles */}
            <div style={{ background: '#fff', border: '1px solid #DDE0D8', borderRadius: 12, padding: '16px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#3C3C3C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Par athlète
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sorted.map((d, i) => {
                  const z = getZone(d.rpe)
                  const pct = ((d.rpe - 1) / 9) * 100
                  return (
                    <div
                      key={d.athleteId}
                      style={{ position: 'relative' }}
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: '0.78rem', color: '#3C3C3C', minWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.name}
                        </div>
                        <div style={{ flex: 1, height: 18, background: '#F0F2EC', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: z.color, borderRadius: 4,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: z.color, minWidth: 24, textAlign: 'right' }}>
                          {d.rpe}
                        </div>
                      </div>
                      {hoveredIdx === i && (
                        <div style={{
                          position: 'absolute', right: 30, top: -28, zIndex: 10,
                          background: '#1A1B18', color: '#fff',
                          borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem',
                          whiteSpace: 'nowrap', pointerEvents: 'none',
                        }}>
                          {d.name} — RPE {d.rpe} — {z.label}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Légende */}
          <div style={{
            marginTop: 14, background: '#fff', border: '1px solid #DDE0D8',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', flexWrap: 'wrap', gap: '8px 24px',
            fontSize: '0.78rem', color: '#3C3C3C',
          }}>
            <span style={{ fontWeight: 700, color: '#6B7069', marginRight: 4 }}>Niveaux de fatigue RPE :</span>
            {ZONES.map((z, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: z.color }} />
                {z.min}–{z.max === 10 ? 10 : Math.floor(z.max)} {z.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
