import { FlaskConical, LockKeyhole, Telescope } from 'lucide-react'
import { useMemo, useState } from 'react'
import CategoryTabs from '../components/CategoryTabs'
import LabCard from '../components/LabCard'
import { labCategories, virtualLabs } from '../data/labs'

export default function LabExplorerSection({ onEnterLab }) {
  const [activeCategory, setActiveCategory] = useState('optics')
  const category = labCategories.find((item) => item.id === activeCategory) ?? labCategories[0]
  const labs = useMemo(() => virtualLabs.filter((lab) => lab.category === activeCategory), [activeCategory])

  return (
    <section id="labs" className="platform-section lab-explorer">
      <div className="section-heading">
        <span><Telescope size={16} /> Vlabs Explorer</span>
        <h2>Choose a physics domain and launch an immersive experiment.</h2>
        <p>
          Built as a scalable directory for optics, mechanics, electromagnetism,
          and modern physics simulations. The optics polarization lab is active now.
        </p>
      </div>

      <CategoryTabs categories={labCategories} activeCategory={activeCategory} onSelect={setActiveCategory} />

      <div className="explorer-grid">
        <aside className="domain-panel">
          <div className="domain-icon"><FlaskConical size={22} /></div>
          <h3>{category.label}</h3>
          <p>{category.summary}</p>
          <span>{category.status}</span>
        </aside>

        <div className="lab-results">
          {labs.length > 0 ? (
            labs.map((lab) => <LabCard key={lab.id} lab={lab} onEnter={onEnterLab} />)
          ) : (
            <div className="coming-soon-card">
              <LockKeyhole size={24} />
              <h3>{category.label} Labs Coming Soon</h3>
              <p>
                This domain is reserved for future interactive experiments. No dummy labs are shown,
                so the directory stays honest and clean.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
