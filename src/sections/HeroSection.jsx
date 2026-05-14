import { ArrowDown, Atom, Orbit, Play } from 'lucide-react'

export default function HeroSection({ onExplore, onLearn }) {
  return (
    <section id="home" className="platform-hero">
      <div className="galaxy-field" aria-hidden="true">
        <span className="nebula nebula-a" />
        <span className="nebula nebula-b" />
        <span className="light-streak streak-a" />
        <span className="light-streak streak-b" />
      </div>

      <div className="hero-content">
        <div className="hero-kicker"><Atom size={16} /> Interactive Scientific Simulation Platform</div>
        <h1>Vlabs</h1>
        <p>
          Explore interactive scientific simulations through real-time visualization,
          Quantum Mechanics, and Experimental Physics.
        </p>
        <div className="hero-actions">
          <button type="button" className="hero-primary" onClick={onExplore}>
            <Play size={17} /> Explore Vlabs
          </button>
          <button type="button" className="hero-secondary" onClick={onLearn}>
            Learn More <ArrowDown size={16} />
          </button>
        </div>
      </div>

      <div className="hero-instrument" aria-hidden="true">
        <div className="science-collage">
          <span className="collage-line line-a" />
          <span className="collage-line line-b" />
          <span className="collage-line line-c" />
          <span className="collage-node node-a" />
          <span className="collage-node node-b" />
          <span className="collage-node node-c" />
          <span className="collage-node node-d" />

          <div className="collage-orbit">
            <span />
            <span />
            <span />
            <Orbit size={64} />
          </div>

          <svg className="collage-optical-bench" viewBox="0 0 360 180">
            <path className="bench-rail" d="M20 140h318M42 158h274" />
            <path className="bench-ray ray-one" d="M28 70h88l50 28h76l74-42" />
            <path className="bench-ray ray-two" d="M28 96h88l50 2h76l74 42" />
            <path className="bench-prism" d="M157 51l47 82h-94Z" />
            <path className="bench-lens" d="M245 38c-23 34-23 72 0 106M272 38c23 34 23 72 0 106" />
            <path className="bench-stand" d="M80 82v58M258 88v52M182 133v25" />
            <circle className="bench-source" cx="48" cy="82" r="18" />
            <circle className="bench-detector" cx="318" cy="98" r="14" />
          </svg>

          <svg className="collage-pendulum" viewBox="0 0 150 190">
            <path className="pendulum-frame" d="M24 168h102M45 168 75 24l30 144M51 24h48" />
            <g className="pendulum-arm">
              <path d="M75 29 47 126" />
              <circle cx="47" cy="126" r="18" />
            </g>
          </svg>

          <svg className="collage-coil" viewBox="0 0 190 160">
            <path className="coil-core" d="M32 80h126" />
            <path className="coil-wire" d="M40 80c0-34 18-34 18 0s18 34 18 0 18-34 18 0 18 34 18 0 18-34 18 0 18 34 18 0" />
            <path className="field-line field-a" d="M28 48c38-30 96-30 134 0" />
            <path className="field-line field-b" d="M28 112c38 30 96 30 134 0" />
            <circle className="coil-terminal" cx="30" cy="80" r="8" />
            <circle className="coil-terminal" cx="160" cy="80" r="8" />
          </svg>

          <svg className="collage-waveform" viewBox="0 0 260 110">
            <path className="scope-grid" d="M12 28h236M12 56h236M12 84h236M58 10v90M130 10v90M202 10v90" />
            <path className="wave-trace" d="M10 58c18-39 35-39 53 0s35 39 53 0 35-39 53 0 35 39 53 0 25-24 38-18" />
          </svg>
        </div>
      </div>
    </section>
  )
}
