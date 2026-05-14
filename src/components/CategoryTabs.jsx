export default function CategoryTabs({ categories, activeCategory, onSelect }) {
  return (
    <div className="category-tabs" role="tablist" aria-label="Physics domains">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          role="tab"
          aria-selected={activeCategory === category.id}
          className={activeCategory === category.id ? 'active' : ''}
          onClick={() => onSelect(category.id)}
        >
          <strong>{category.label}</strong>
          <span>{category.status}</span>
        </button>
      ))}
    </div>
  )
}
