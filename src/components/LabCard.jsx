import { ArrowRight, BadgeCheck, Sparkles } from 'lucide-react'

export default function LabCard({ lab, onEnter }) {
  return (
    <article className="lab-card">
      <div className="lab-card-orbit" />
      <div className="lab-card-top">
        <span className="lab-badge">{lab.badge}</span>
        <span className="lab-difficulty"><BadgeCheck size={14} /> {lab.difficulty}</span>
      </div>
      <div className="lab-card-visual" aria-hidden="true">
        <span />
        <i />
        <b />
      </div>
      <h3>{lab.title}</h3>
      <p>{lab.description}</p>
      <div className="lab-metrics">
        {lab.metrics.map((metric) => <span key={metric}>{metric}</span>)}
      </div>
      <button type="button" className="lab-enter-button" onClick={() => onEnter(lab.route)}>
        <Sparkles size={16} /> Enter Vlab <ArrowRight size={16} />
      </button>
    </article>
  )
}
