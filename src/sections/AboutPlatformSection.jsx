import { Gauge, Layers3, ScanLine, ShieldCheck } from 'lucide-react'

const pillars = [
  {
    icon: ScanLine,
    title: 'Real-Time Visualization',
    copy: 'Scientific state changes are shown through live geometry, graphs, and animated experimental feedback.',
  },
  {
    icon: Layers3,
    title: 'Physics Domains',
    copy: 'A platform shell for optics, mechanics, electromagnetism, and modern physics labs as the ecosystem expands.',
  },
  {
    icon: Gauge,
    title: 'Interactive Control',
    copy: 'Students can tune parameters directly and observe how mathematical models respond in the virtual apparatus.',
  },
  {
    icon: ShieldCheck,
    title: 'Research-Grade Clarity',
    copy: 'The directory opens real labs only, keeping future categories marked as coming soon until simulations are ready.',
  },
]

export default function AboutPlatformSection() {
  return (
    <section id="about" className="platform-section about-platform">
      <div className="section-heading compact">
        <span>Platform Architecture</span>
        <h2>A cinematic gateway for rigorous physics experiments.</h2>
      </div>
      <div className="pillar-grid">
        {pillars.map(({ icon: Icon, title, copy }) => (
          <article key={title} className="pillar-card">
            <Icon size={22} />
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
